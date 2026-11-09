using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using RankVendedores.Admin.Models;

namespace RankVendedores.Admin.Services;

public sealed class SupabaseService : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    // Mesmos dados públicos usados pelo site. A publishable key é apropriada
    // para clientes; permissões continuam protegidas por autenticação e RLS.
    private const string DefaultSupabaseUrl = "https://xmpurrxwfgzhnrqhrzyt.supabase.co";
    private const string DefaultPublishableKey = "sb_publishable_HGi_8HXwyr4SEzoIKunMiA_cmWsFI8U";
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(25) };
    private readonly string _url;
    private readonly string _key;
    private AuthResponse? _session;

    public SupabaseService()
    {
        _url = Environment.GetEnvironmentVariable("UNI_SUPABASE_URL") ?? DefaultSupabaseUrl;
        _key = Environment.GetEnvironmentVariable("UNI_SUPABASE_PUBLISHABLE_KEY") ?? DefaultPublishableKey;
        if (!Uri.TryCreate(_url, UriKind.Absolute, out _))
            throw new InvalidOperationException("Configure a variável UNI_SUPABASE_URL com a URL do projeto Supabase.");
        if (string.IsNullOrWhiteSpace(_key))
            throw new InvalidOperationException("Configure UNI_SUPABASE_PUBLISHABLE_KEY com a chave pública do projeto.");
        _http.DefaultRequestHeaders.TryAddWithoutValidation("apikey", _key);
    }

    public async Task<(AdminProfile Profile, IReadOnlyList<Branch> Branches)> SignInAsync(string email, string password, CancellationToken cancellationToken = default)
    {
        using var loginResponse = await _http.PostAsJsonAsync(
            new Uri(new Uri(_url), "/auth/v1/token?grant_type=password"),
            new { email, password }, JsonOptions, cancellationToken);
        if (!loginResponse.IsSuccessStatusCode)
            throw await CreateApiException(loginResponse, "Não foi possível entrar.", cancellationToken);

        _session = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>(JsonOptions, cancellationToken)
            ?? throw new InvalidOperationException("O Supabase retornou uma sessão vazia.");
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _session.AccessToken);

        var profileUrl = new Uri(new Uri(_url), $"/rest/v1/admin_usuarios?select=user_id,filial_id,is_superadmin,ativo&user_id=eq.{_session.User.Id}&ativo=eq.true");
        using var profileResponse = await _http.GetAsync(profileUrl, cancellationToken);
        if (!profileResponse.IsSuccessStatusCode)
            throw await CreateApiException(profileResponse, "Não foi possível validar o acesso administrativo.", cancellationToken);
        var profiles = await profileResponse.Content.ReadFromJsonAsync<List<AdminProfile>>(JsonOptions, cancellationToken) ?? [];
        var profile = profiles.FirstOrDefault(p => p.Active)
            ?? throw new UnauthorizedAccessException("Esta conta não está ativa como administradora.");
        if (!profile.IsSuperAdmin && profile.BranchId is null)
            throw new UnauthorizedAccessException("A conta regional não está vinculada a uma filial.");

        var branchesUrl = new Uri(new Uri(_url), "/rest/v1/filiais?select=id,nome,ativo&ativo=eq.true&order=nome");
        using var branchesResponse = await _http.GetAsync(branchesUrl, cancellationToken);
        if (!branchesResponse.IsSuccessStatusCode)
            throw await CreateApiException(branchesResponse, "A sessão entrou, mas não foi possível carregar as filiais.", cancellationToken);
        var branches = await branchesResponse.Content.ReadFromJsonAsync<List<Branch>>(JsonOptions, cancellationToken) ?? [];
        if (!profile.IsSuperAdmin) branches = branches.Where(b => b.Id == profile.BranchId).ToList();

        if (branches.Count == 0)
            throw new UnauthorizedAccessException("Esta conta não tem uma filial ativa disponível.");

        return (profile, branches);
    }

    public async Task<IReadOnlyList<MonthlyRankingRow>> LoadMonthlyRankingAsync(long branchId, int month, int year, CancellationToken cancellationToken = default)
    {
        if (_session is null) throw new UnauthorizedAccessException("Entre novamente para carregar o ranking.");
        var url = new Uri(new Uri(_url), "/rest/v1/rpc/calcular_rank_mensal_filial");
        using var response = await _http.PostAsJsonAsync(url, new
        {
            p_filial_id = branchId,
            p_mes = month,
            p_ano = year,
        }, JsonOptions, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw await CreateApiException(response, "Não foi possível carregar o ranking da regional.", cancellationToken);
        return await response.Content.ReadFromJsonAsync<List<MonthlyRankingRow>>(JsonOptions, cancellationToken) ?? [];
    }

    public async Task<IReadOnlyList<Vendor>> LoadVendorsAsync(long branchId, CancellationToken cancellationToken = default)
    {
        EnsureSignedIn();
        var url = new Uri(new Uri(_url), $"/rest/v1/vendedores?select=id,nome,tipo&filial_id=eq.{branchId}&ativo=eq.true&order=nome");
        using var response = await _http.GetAsync(url, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw await CreateApiException(response, "Não foi possível carregar os vendedores desta filial.", cancellationToken);
        return await response.Content.ReadFromJsonAsync<List<Vendor>>(JsonOptions, cancellationToken) ?? [];
    }

    public async Task<IReadOnlyList<Vendor>> LoadVendorManagementAsync(long branchId, CancellationToken cancellationToken = default)
    {
        EnsureSignedIn();
        var url = new Uri(new Uri(_url), $"/rest/v1/vendedores?select=id,nome,tipo,filial_id,ixc_vendedor_id,ativo,participa_ranking&filial_id=eq.{branchId}&order=nome");
        using var response = await _http.GetAsync(url, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw await CreateApiException(response, "Não foi possível carregar os vendedores desta filial.", cancellationToken);
        return await response.Content.ReadFromJsonAsync<List<Vendor>>(JsonOptions, cancellationToken) ?? [];
    }

    public async Task UpdateVendorAsync(Vendor vendor, long branchId, CancellationToken cancellationToken = default)
    {
        EnsureSignedIn();
        var url = new Uri(new Uri(_url), $"/rest/v1/vendedores?id=eq.{vendor.Id}&filial_id=eq.{branchId}");
        using var request = new HttpRequestMessage(HttpMethod.Patch, url)
        {
            Content = JsonContent.Create(new
            {
                nome = vendor.Name.Trim(), tipo = vendor.Type, ativo = vendor.Active,
                participa_ranking = vendor.ParticipatesInRanking, ixc_vendedor_id = vendor.IxcVendorId,
            }, options: JsonOptions),
        };
        request.Headers.TryAddWithoutValidation("Prefer", "return=representation");
        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw await CreateApiException(response, "Não foi possível salvar as alterações do vendedor.", cancellationToken);
        var updated = await response.Content.ReadFromJsonAsync<List<JsonElement>>(JsonOptions, cancellationToken) ?? [];
        if (updated.Count == 0) throw new UnauthorizedAccessException("O Supabase não autorizou a alteração deste vendedor nesta filial.");
    }

    public async Task<bool> CreateVendorAsync(string name, string type, string ixcVendorId, bool participatesInRanking, Branch branch, CancellationToken cancellationToken = default)
    {
        EnsureSignedIn();
        var slug = $"{SlugPart(name)}-{SlugPart(branch.Name)}";
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(new Uri(_url), "/rest/v1/vendedores?select=id,nome,tipo,filial_id,ixc_vendedor_id,ativo,participa_ranking"))
        {
            Content = JsonContent.Create(new
            {
                nome = name.Trim(), tipo = type, ativo = true, filial_id = branch.Id, ixc_vendedor_id = string.IsNullOrWhiteSpace(ixcVendorId) ? null : ixcVendorId.Trim(),
                participa_ranking = participatesInRanking, slug,
            }, options: JsonOptions),
        };
        request.Headers.TryAddWithoutValidation("Prefer", "return=representation");
        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw await CreateApiException(response, "Não foi possível cadastrar o vendedor. A conta pode não ter permissão de criação.", cancellationToken);
        var created = await response.Content.ReadFromJsonAsync<List<Vendor>>(JsonOptions, cancellationToken) ?? [];
        if (created.Count == 0) throw new InvalidOperationException("O Supabase não retornou o cadastro do vendedor.");
        return type != "interno" || await SyncRenewalTargetAsync(created[0].Id, branch.Id, cancellationToken);
    }

    private async Task<bool> SyncRenewalTargetAsync(long vendorId, long branchId, CancellationToken cancellationToken)
    {
        var now = DateTime.Now;
        var url = new Uri(new Uri(_url), $"/rest/v1/metas_renovacao_filial?select=meta_m3,meta_m2,meta_m1&filial_id=eq.{branchId}&mes=eq.{now.Month}&ano=eq.{now.Year}&limit=1");
        using var response = await _http.GetAsync(url, cancellationToken);
        if (!response.IsSuccessStatusCode) return false; // Meta de renovação é opcional; o cadastro já foi criado.
        var targets = await response.Content.ReadFromJsonAsync<List<JsonElement>>(JsonOptions, cancellationToken) ?? [];
        if (targets.Count == 0) return true;
        var target = targets[0];
        decimal Read(string name) => target.TryGetProperty(name, out var value) && value.TryGetDecimal(out var number) ? number : 0;
        using var upsert = new HttpRequestMessage(HttpMethod.Post, new Uri(new Uri(_url), "/rest/v1/metas_renovacao_individual?on_conflict=vendedor_id%2Cmes%2Cano"))
        {
            Content = JsonContent.Create(new
            {
                filial_id = branchId, vendedor_id = vendorId, mes = now.Month, ano = now.Year,
                meta_m3 = Read("meta_m3"), meta_m2 = Read("meta_m2"), meta_m1 = Read("meta_m1"), atualizado_em = DateTimeOffset.Now,
            }, options: JsonOptions),
        };
        upsert.Headers.TryAddWithoutValidation("Prefer", "resolution=merge-duplicates,return=minimal");
        using var upsertResponse = await _http.SendAsync(upsert, cancellationToken);
        return upsertResponse.IsSuccessStatusCode;
    }

    private static string SlugPart(string value) => Regex.Replace(value.Normalize(NormalizationForm.FormD)
        .Where(character => System.Globalization.CharUnicodeInfo.GetUnicodeCategory(character) != System.Globalization.UnicodeCategory.NonSpacingMark)
        .Aggregate(new StringBuilder(), (builder, character) => builder.Append(character)).ToString().ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');

    public async Task<IReadOnlyList<Vendor>> LoadIxcVendorsAsync(CancellationToken cancellationToken = default)
    {
        EnsureSignedIn();
        var url = new Uri(new Uri(_url), "/rest/v1/vendedores?select=id,nome,tipo,filial_id,ixc_vendedor_id,ativo&ativo=eq.true&ixc_vendedor_id=not.is.null&order=filial_id&order=nome");
        using var response = await _http.GetAsync(url, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw await CreateApiException(response, "Não foi possível carregar os vínculos de vendedores do IXC.", cancellationToken);
        return await response.Content.ReadFromJsonAsync<List<Vendor>>(JsonOptions, cancellationToken) ?? [];
    }

    public async Task<IReadOnlyList<Plan>> LoadPlansAsync(CancellationToken cancellationToken = default)
    {
        EnsureSignedIn();
        var url = new Uri(new Uri(_url), "/rest/v1/planos?select=*&order=nome");
        using var response = await _http.GetAsync(url, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw await CreateApiException(response, "Não foi possível carregar os planos.", cancellationToken);
        return await response.Content.ReadFromJsonAsync<List<Plan>>(JsonOptions, cancellationToken) ?? [];
    }

    public async Task<IReadOnlyList<AdditionalProduct>> LoadAdditionalProductsAsync(CancellationToken cancellationToken = default)
    {
        EnsureSignedIn();
        var url = new Uri(new Uri(_url), "/rest/v1/produtos_adicionais?select=id,nome,valor&ativo=eq.true&order=nome");
        using var response = await _http.GetAsync(url, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw await CreateApiException(response, "Não foi possível carregar os produtos adicionais.", cancellationToken);
        return await response.Content.ReadFromJsonAsync<List<AdditionalProduct>>(JsonOptions, cancellationToken) ?? [];
    }

    public async Task CreateStandaloneAdditionalAsync(long? vendorId, long productId, DateOnly date, int quantity, decimal unitValue, string? note, CancellationToken cancellationToken = default)
    {
        EnsureSignedIn();
        var payload = new
        {
            vendedor_id = vendorId, produto_adicional_id = productId, data_venda = date.ToString("yyyy-MM-dd"),
            quantidade = quantity, valor_unitario = unitValue, observacao = note,
        };
        using var response = await _http.PostAsJsonAsync(new Uri(new Uri(_url), "/rest/v1/adicionais_avulsos"), payload, JsonOptions, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw await CreateApiException(response, "Não foi possível registrar o adicional avulso.", cancellationToken);
    }

    public async Task CreateReceivedSaleAsync(long branchId, long planId, DateOnly date, int quantity, decimal unitValue, string? note, CancellationToken cancellationToken = default)
    {
        EnsureSignedIn();
        var payload = new
        {
            filial_id = branchId, plano_id = planId, quantidade = quantity, valor_unitario = unitValue,
            valor_total = quantity * unitValue, data_venda = date.ToString("yyyy-MM-dd"), observacao = note,
        };
        using var response = await _http.PostAsJsonAsync(new Uri(new Uri(_url), "/rest/v1/vendas_outras_filiais"), payload, JsonOptions, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw await CreateApiException(response, "Não foi possível registrar a venda recebida de outra filial.", cancellationToken);
    }

    public async Task<IReadOnlyList<IxcExistingContract>> FindIxcContractsAsync(IReadOnlyList<string> contracts, CancellationToken cancellationToken = default)
    {
        EnsureSignedIn();
        var found = new List<IxcExistingContract>();
        for (var offset = 0; offset < contracts.Count; offset += 250)
        {
            var batch = contracts.Skip(offset).Take(250).ToArray();
            var rows = await InvokeRpcAsync<List<IxcExistingContract>>("vendas_ixc_contratos_existentes", new { p_numeros_venda = batch }, cancellationToken);
            if (rows is not null) found.AddRange(rows);
        }
        return found;
    }

    public async Task InvokeRpcAsync(string functionName, object arguments, CancellationToken cancellationToken = default)
    {
        _ = await InvokeRpcAsync<JsonElement>(functionName, arguments, cancellationToken);
    }

    public Task<JsonElement?> InvokeRpcResultAsync(string functionName, object arguments, CancellationToken cancellationToken = default) =>
        InvokeRpcAsync<JsonElement?>(functionName, arguments, cancellationToken);

    private async Task<T?> InvokeRpcAsync<T>(string functionName, object arguments, CancellationToken cancellationToken)
    {
        EnsureSignedIn();
        using var response = await _http.PostAsJsonAsync(new Uri(new Uri(_url), $"/rest/v1/rpc/{functionName}"), arguments, JsonOptions, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw await CreateApiException(response, $"A operação {functionName} não foi concluída.", cancellationToken);
        if (response.Content.Headers.ContentLength == 0) return default;
        return await response.Content.ReadFromJsonAsync<T>(JsonOptions, cancellationToken);
    }

    public async Task<long> CreateSaleAsync(SaleRequest sale, CancellationToken cancellationToken = default)
    {
        EnsureSignedIn();
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(new Uri(_url), "/rest/v1/vendas?select=id"))
        {
            Content = JsonContent.Create(sale, options: JsonOptions),
        };
        request.Headers.TryAddWithoutValidation("Prefer", "return=representation");
        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw await CreateApiException(response, "Não foi possível registrar a venda.", cancellationToken);
        var created = await response.Content.ReadFromJsonAsync<List<JsonElement>>(JsonOptions, cancellationToken) ?? [];
        if (created.Count == 0 || !created[0].TryGetProperty("id", out var id)) throw new InvalidOperationException("A venda foi enviada, mas o Supabase não retornou o identificador para vincular os adicionais.");
        return id.GetInt64();
    }

    public async Task CreateSaleAdditionalsAsync(long saleId, IReadOnlyList<AdditionalProduct> products, CancellationToken cancellationToken = default)
    {
        EnsureSignedIn();
        if (products.Count == 0) return;
        var rows = products.Select(product => new
        {
            venda_id = saleId, produto_adicional_id = product.Id, quantidade = 1, valor_unitario = product.Value,
        }).ToList();
        using var response = await _http.PostAsJsonAsync(new Uri(new Uri(_url), "/rest/v1/venda_adicionais"), rows, JsonOptions, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw await CreateApiException(response, "A venda foi registrada, mas não foi possível gravar os adicionais vinculados.", cancellationToken);
    }

    public async Task<int> QueueIxcReviewRowsAsync(IReadOnlyList<object> rows, CancellationToken cancellationToken = default)
    {
        EnsureSignedIn();
        if (rows.Count == 0) return 0;
        using var request = new HttpRequestMessage(HttpMethod.Post,
            new Uri(new Uri(_url), "/rest/v1/vendas_importacao_revisao_ixc?on_conflict=filial_contexto_id%2Cchave_origem"))
        {
            Content = JsonContent.Create(rows, options: JsonOptions),
        };
        request.Headers.TryAddWithoutValidation("Prefer", "resolution=ignore-duplicates,return=minimal");
        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw await CreateApiException(response, "Não foi possível enviar as linhas incompletas para revisão IXC.", cancellationToken);
        return rows.Count;
    }

    public async Task<IReadOnlySet<string>> LoadRenewalContractsAsync(long branchId, int month, int year, CancellationToken cancellationToken = default)
    {
        EnsureSignedIn();
        var contracts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        const int pageSize = 1000;
        for (var offset = 0; ; offset += pageSize)
        {
            var url = new Uri(new Uri(_url), $"/rest/v1/renovacoes_registros?select=contrato&filial_id=eq.{branchId}&mes=eq.{month}&ano=eq.{year}&order=id");
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.TryAddWithoutValidation("Range", $"{offset}-{offset + pageSize - 1}");
            using var response = await _http.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
                throw await CreateApiException(response, "Não foi possível conferir as renovações já importadas.", cancellationToken);
            using var json = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(json, cancellationToken: cancellationToken);
            var batch = document.RootElement.EnumerateArray().Select(row => row.TryGetProperty("contrato", out var value) ? value.GetString() ?? string.Empty : string.Empty).ToList();
            foreach (var contract in batch) contracts.Add(Regex.Replace(contract.Trim(), @"\s+", ""));
            if (batch.Count < pageSize) break;
        }
        return contracts;
    }

    private void EnsureSignedIn()
    {
        if (_session is null) throw new UnauthorizedAccessException("Entre novamente para continuar.");
    }

    public void SignOut()
    {
        _session = null;
        _http.DefaultRequestHeaders.Authorization = null;
    }

    private static async Task<Exception> CreateApiException(HttpResponseMessage response, string fallback, CancellationToken cancellationToken)
    {
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        try
        {
            var error = JsonSerializer.Deserialize<SupabaseError>(body, JsonOptions);
            if (error?.Code == "23505")
                return new InvalidOperationException("Este número de contrato já foi registrado.");
            var message = error?.Description ?? error?.Message ?? error?.AlternativeMessage;
            if (!string.IsNullOrWhiteSpace(message))
                return response.StatusCode == System.Net.HttpStatusCode.Unauthorized
                    ? new UnauthorizedAccessException("E-mail ou senha inválidos.")
                    : new InvalidOperationException(message);
        }
        catch (JsonException) { }
        return response.StatusCode == System.Net.HttpStatusCode.Unauthorized
            ? new UnauthorizedAccessException("E-mail ou senha inválidos.")
            : new InvalidOperationException(fallback);
    }

    public void Dispose() => _http.Dispose();
}

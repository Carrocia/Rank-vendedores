using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
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

    public async Task<IReadOnlyList<Plan>> LoadPlansAsync(CancellationToken cancellationToken = default)
    {
        EnsureSignedIn();
        var url = new Uri(new Uri(_url), "/rest/v1/planos?select=id,nome,valor,velocidade_mb,eh_servico&order=nome");
        using var response = await _http.GetAsync(url, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw await CreateApiException(response, "Não foi possível carregar os planos.", cancellationToken);
        return await response.Content.ReadFromJsonAsync<List<Plan>>(JsonOptions, cancellationToken) ?? [];
    }

    public async Task CreateSaleAsync(SaleRequest sale, CancellationToken cancellationToken = default)
    {
        EnsureSignedIn();
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(new Uri(_url), "/rest/v1/vendas"))
        {
            Content = JsonContent.Create(sale, options: JsonOptions),
        };
        request.Headers.TryAddWithoutValidation("Prefer", "return=minimal");
        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw await CreateApiException(response, "Não foi possível registrar a venda.", cancellationToken);
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

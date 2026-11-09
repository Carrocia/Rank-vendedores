using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Text.Json;
using Microsoft.Win32;
using RankVendedores.Admin.Models;
using RankVendedores.Admin.Services;

namespace RankVendedores.Admin;

public partial class MainWindow : Window
{
    private readonly SupabaseService _supabase;
    private IReadOnlyList<Branch> _branches = [];
    private bool _changingBranch;
    private int _rankingLoadVersion;
    private bool _isSuperAdmin;
    private string _currentModule = "ranking";
    private string? _ixcFilePath;
    private List<IxcImportRow> _ixcRows = [];
    private string? _renewalFilePath;
    private List<RenewalImportRow> _renewalRows = [];
    private IReadOnlyList<Vendor> _managedVendors = [];

    private static readonly Dictionary<string, (string Title, string Description)> AdminModules = new()
    {
        ["nova-venda"] = ("Nova venda e IXC", "Registrar vendas, importar o arquivo do IXC, revisar vínculos pendentes e conferir contratos."),
        ["adicionais"] = ("Vendas adicionais", "Lançar adicionais vinculados a uma venda ou registrar adicionais avulsos."),
        ["vendas-recebidas"] = ("Vendas recebidas entre filiais", "Registrar vendas que chegaram de outra filial e consultar os contratos recebidos."),
        ["renovacoes"] = ("Renovações", "Importar renovações, conferir plano e valor, consultar metas e exportar o resumo."),
        ["vendedores"] = ("Vendedores", "Cadastrar e editar vendedores, gerenciar participação no ranking e consultar a equipe."),
        ["analitica"] = ("Analítica", "Consultar o desempenho individual, evolução e progressão comercial."),
        ["metas"] = ("Metas", "Consultar metas de vendas e renovações por período e por equipe."),
        ["config-metas"] = ("Configuração de metas", "Ajustar metas da filial, níveis da equipe e parâmetros de cancelamento."),
        ["ranking-adm"] = ("Ranking da filial", "Acompanhar a classificação mensal da equipe e os resultados por vendedor."),
        ["celebracoes"] = ("Celebrações", "Consultar metas alcançadas e preparar cards de celebração de períodos anteriores."),
        ["relatorios"] = ("Relatórios", "Consultar, filtrar e exportar os dados operacionais da filial."),
        ["rede"] = ("Visão da rede", "Consolidar os indicadores comerciais de todas as filiais permitidas."),
        ["planos"] = ("Planos e categorias", "Gerenciar o catálogo de planos, categorias e valores usados nos lançamentos."),
        ["tema"] = ("Tema do site", "Pré-visualizar e controlar os temas sazonais do site público."),
        ["admins"] = ("Contas regionais", "Criar e administrar acessos regionais ao painel."),
        ["filiais"] = ("Filiais e regionais", "Consultar e gerenciar filiais, regionais e suas configurações."),
    };

    public MainWindow()
    {
        InitializeComponent();
        try
        {
            _supabase = new SupabaseService();
        }
        catch (Exception error)
        {
            _supabase = null!;
            LoginButton.IsEnabled = false;
            ShowLoginError(error.Message);
        }
    }

    private async void LoginButton_Click(object sender, RoutedEventArgs e) => await SignInAsync();

    private async void PasswordInput_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter) await SignInAsync();
    }

    private async Task SignInAsync()
    {
        LoginError.Visibility = Visibility.Collapsed;
        var email = EmailInput.Text.Trim();
        var password = PasswordInput.Password;
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            ShowLoginError("Informe seu e-mail e sua senha.");
            return;
        }

        LoginButton.IsEnabled = false;
        LoginButton.Content = "Conectando…";
        try
        {
            var (profile, branches) = await _supabase.SignInAsync(email, password);
            _isSuperAdmin = profile.IsSuperAdmin;
            _branches = branches;
            _changingBranch = true;
            BranchSelector.ItemsSource = _branches;
            BranchSelector.SelectedItem = profile.IsSuperAdmin
                ? _branches.FirstOrDefault()
                : _branches.FirstOrDefault(branch => branch.Id == profile.BranchId);
            BranchSelector.IsEnabled = profile.IsSuperAdmin && _branches.Count > 1;
            _changingBranch = false;
            AccessType.Text = profile.IsSuperAdmin ? "Superadministrador" : "Acesso regional";
            NavNetwork.Visibility = _isSuperAdmin ? Visibility.Visible : Visibility.Collapsed;
            NavPlans.Visibility = _isSuperAdmin ? Visibility.Visible : Visibility.Collapsed;
            NavTheme.Visibility = _isSuperAdmin ? Visibility.Visible : Visibility.Collapsed;
            NavAdmins.Visibility = _isSuperAdmin ? Visibility.Visible : Visibility.Collapsed;
            NavBranches.Visibility = _isSuperAdmin ? Visibility.Visible : Visibility.Collapsed;
            SignedInEmail.Text = email;
            UpdateBranchLabel();
            PasswordInput.Clear();
            LoginView.Visibility = Visibility.Collapsed;
            DashboardView.Visibility = Visibility.Visible;
            await ShowModuleAsync("ranking");
        }
        catch (Exception error)
        {
            _supabase.SignOut();
            ShowLoginError(error.Message);
        }
        finally
        {
            LoginButton.IsEnabled = true;
            LoginButton.Content = "Entrar";
        }
    }

    private async void BranchSelector_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (_changingBranch) return;
        UpdateBranchLabel();
        if (_currentModule == "nova-venda") await LoadSaleOptionsAsync();
        else if (_currentModule == "renovacoes" && BranchSelector.SelectedItem is Branch renewalBranch) RenewalBranchHint.Text = $"As renovações serão lançadas para {renewalBranch.Name}.";
        else if (_currentModule == "adicionais" || _currentModule == "vendas-recebidas") await LoadCommercialOptionsAsync();
        else if (_currentModule == "vendedores") await LoadVendorsManagementAsync();
        else if (_currentModule == "ranking") await LoadMonthlyRankingAsync();
    }

    private void UpdateBranchLabel()
    {
        if (BranchSelector.SelectedItem is Branch branch)
            SelectedBranchLabel.Text = $"Dados selecionados: {branch.Name}";
    }

    private async void NavigationButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not System.Windows.Controls.Button button || button.Tag is not string moduleId) return;
        await ShowModuleAsync(moduleId);
    }

    private async Task ShowModuleAsync(string moduleId)
    {
        var superAdminModules = new HashSet<string>(StringComparer.Ordinal)
        {
            "rede", "planos", "tema", "admins", "filiais",
        };
        if (superAdminModules.Contains(moduleId) && !_isSuperAdmin)
        {
            MessageBox.Show("Este módulo está disponível somente para o superadministrador.", "Acesso restrito", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        foreach (var button in FindVisualChildren<System.Windows.Controls.Button>(DashboardView)
                     .Where(item => item.Tag is string))
        {
            button.ClearValue(System.Windows.Controls.Control.BackgroundProperty);
            button.ClearValue(System.Windows.Controls.Control.ForegroundProperty);
        }
        var selectedButton = FindVisualChildren<System.Windows.Controls.Button>(DashboardView)
            .FirstOrDefault(item => string.Equals(item.Tag?.ToString(), moduleId, StringComparison.Ordinal));
        if (selectedButton is not null)
        {
            selectedButton.Background = new SolidColorBrush(Color.FromRgb(23, 49, 61));
            selectedButton.Foreground = (Brush)FindResource("BrushAccent");
        }

        _currentModule = moduleId;
        SaleEntryContent.Visibility = Visibility.Collapsed;
        RenewalContent.Visibility = Visibility.Collapsed;
        VendorsContent.Visibility = Visibility.Collapsed;
        AdditionalContent.Visibility = Visibility.Collapsed;
        ReceivedSalesContent.Visibility = Visibility.Collapsed;
        ModuleContent.Visibility = Visibility.Collapsed;
        RankingContent.Visibility = Visibility.Collapsed;

        if (moduleId == "ranking")
        {
            RankingContent.Visibility = Visibility.Visible;
            await LoadMonthlyRankingAsync();
            return;
        }

        if (moduleId == "nova-venda")
        {
            SaleEntryContent.Visibility = Visibility.Visible;
            SaleBranchHint.Text = BranchSelector.SelectedItem is Branch branch ? $"Venda vinculada a {branch.Name}." : "Selecione uma filial para continuar.";
            await LoadSaleOptionsAsync();
            return;
        }
        if (moduleId == "renovacoes")
        {
            RenewalContent.Visibility = Visibility.Visible;
            RenewalBranchHint.Text = BranchSelector.SelectedItem is Branch renewalBranch ? $"As renovações serão lançadas para {renewalBranch.Name}." : "Selecione uma filial para continuar.";
            RenewalMonthInput.SelectedDate ??= DateTime.Today;
            return;
        }
        if (moduleId is "adicionais" or "vendas-recebidas")
        {
            var isReceived = moduleId == "vendas-recebidas";
            if (isReceived) ReceivedSalesContent.Visibility = Visibility.Visible;
            else AdditionalContent.Visibility = Visibility.Visible;
            await LoadCommercialOptionsAsync();
            return;
        }
        if (moduleId == "vendedores")
        {
            VendorsContent.Visibility = Visibility.Visible;
            await LoadVendorsManagementAsync();
            return;
        }

        if (!AdminModules.TryGetValue(moduleId, out var module)) return;
        ModuleContent.Visibility = Visibility.Visible;
        ModuleTitle.Text = module.Title;
        ModuleDescription.Text = module.Description;
        ModuleStatus.Text = "Esta tela está preparada na navegação do app, mas sua operação ainda está sendo migrada. O site administrativo continua disponível para esta tarefa.";
    }

    private async Task LoadSaleOptionsAsync()
    {
        if (BranchSelector.SelectedItem is not Branch branch || _supabase is null) return;
        SaleBranchHint.Text = $"Vendedor, filial e metas seguem {branch.Name}.";
        SaleFormMessage.Text = "Carregando vendedores e planos…";
        SaveSaleButton.IsEnabled = false;
        try
        {
            var vendorsTask = _supabase.LoadVendorsAsync(branch.Id);
            var plansTask = _supabase.LoadPlansAsync();
            var productsTask = _supabase.LoadAdditionalProductsAsync();
            await Task.WhenAll(vendorsTask, plansTask, productsTask);
            if (BranchSelector.SelectedItem is not Branch current || current.Id != branch.Id || _currentModule != "nova-venda") return;
            var vendors = await vendorsTask;
            var plans = await plansTask;
            var products = await productsTask;
            SaleVendorSelector.ItemsSource = vendors;
            SalePlanSelector.ItemsSource = plans;
            SaleAdditionalSelector.ItemsSource = products;
            SaleFormMessage.Text = vendors.Count == 0
                ? "Nenhum vendedor ativo encontrado nesta filial. Cadastre ou ative um vendedor para registrar vendas."
                : $"{vendors.Count} vendedor(es) e {plans.Count} plano(s) carregados.";
            if (SaleDateInput.SelectedDate is null) SaleDateInput.SelectedDate = DateTime.Today;
            if (SaleTimeInput.Text == "12:00") SaleTimeInput.Text = DateTime.Now.ToString("HH:mm");
        }
        catch (Exception error)
        {
            SaleVendorSelector.ItemsSource = null;
            SalePlanSelector.ItemsSource = null;
            SaleFormMessage.Text = $"Não foi possível carregar os dados: {error.Message}";
        }
        finally
        {
            SaveSaleButton.IsEnabled = true;
        }
    }

    private void SalePlanSelector_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (SalePlanSelector.SelectedItem is Plan plan) SaleValueInput.Text = (plan.Value ?? 0).ToString("0.00", CultureInfo.GetCultureInfo("pt-BR"));
    }

    private void ResetSaleButton_Click(object sender, RoutedEventArgs e)
    {
        SaleVendorSelector.SelectedItem = null;
        SalePlanSelector.SelectedItem = null;
        SaleContractInput.Clear();
        SaleDateInput.SelectedDate = DateTime.Today;
        SaleTimeInput.Text = DateTime.Now.ToString("HH:mm");
        SaleValueInput.Clear();
        SaleClientInput.Clear();
        SaleOutsideBranch.IsChecked = false;
        SaleNotesInput.Clear();
        SaleAdditionalSelector.SelectedItems.Clear();
        SaleFormMessage.Text = "Formulário limpo.";
    }

    private async void SaveSaleButton_Click(object sender, RoutedEventArgs e)
    {
        if (BranchSelector.SelectedItem is not Branch branch || SaleVendorSelector.SelectedItem is not Vendor vendor || SalePlanSelector.SelectedItem is not Plan plan)
        {
            SaleFormMessage.Text = "Selecione a filial, o vendedor e o plano.";
            return;
        }
        if (string.IsNullOrWhiteSpace(SaleContractInput.Text))
        {
            SaleFormMessage.Text = "Informe o número do contrato.";
            SaleContractInput.Focus();
            return;
        }
        if (SaleDateInput.SelectedDate is not DateTime date || !TimeSpan.TryParseExact(SaleTimeInput.Text.Trim(), @"hh\:mm", CultureInfo.InvariantCulture, out var time))
        {
            SaleFormMessage.Text = "Informe uma data e um horário válido no formato HH:mm.";
            return;
        }
        var cultura = CultureInfo.GetCultureInfo("pt-BR");
        var textoValor = SaleValueInput.Text.Trim().Replace("R$", "", StringComparison.OrdinalIgnoreCase).Trim();
        if ((!decimal.TryParse(textoValor, NumberStyles.Number, cultura, out var valor) && !decimal.TryParse(textoValor, NumberStyles.Number, CultureInfo.InvariantCulture, out valor)) || valor < 0)
        {
            SaleFormMessage.Text = "Informe um valor válido para a venda.";
            SaleValueInput.Focus();
            return;
        }

        var localTime = DateTime.SpecifyKind(date.Date.Add(time), DateTimeKind.Unspecified);
        var client = SaleClientInput.Text.Trim();
        var notes = SaleNotesInput.Text.Trim();
        var completeNotes = string.Join(" — ", new[]
        {
            string.IsNullOrWhiteSpace(client) ? null : $"Cliente: {client}",
            string.IsNullOrWhiteSpace(notes) ? null : notes,
        }.Where(value => value is not null));
        var sale = new SaleRequest
        {
            VendorId = vendor.Id,
            OriginBranchId = branch.Id,
            DestinationBranchId = branch.Id,
            PlanId = plan.Id,
            SaleDate = new DateTimeOffset(localTime, TimeZoneInfo.Local.GetUtcOffset(localTime)),
            Value = valor,
            ContractNumber = SaleContractInput.Text.Trim(),
            Notes = string.IsNullOrWhiteSpace(completeNotes) ? null : completeNotes,
            OutsideBranch = SaleOutsideBranch.IsChecked == true,
        };
        SaveSaleButton.IsEnabled = false;
        SaleFormMessage.Text = "Registrando venda no Supabase…";
        try
        {
            var saleId = await _supabase.CreateSaleAsync(sale);
            string? additionalError = null;
            try
            {
                var additionals = SaleAdditionalSelector.SelectedItems.Cast<AdditionalProduct>().ToList();
                await _supabase.CreateSaleAdditionalsAsync(saleId, additionals);
            }
            catch (Exception error) { additionalError = error.Message; }
            ResetSaleButton_Click(this, new RoutedEventArgs());
            SaleFormMessage.Text = additionalError is null
                ? "Venda registrada com sucesso, incluindo os adicionais selecionados. Confira o ranking atualizado no painel."
                : $"A venda foi registrada (nº {saleId}), mas houve falha ao salvar os adicionais: {additionalError}. Não repita a venda; registre o adicional avulso em Vendas adicionais.";
            await LoadMonthlyRankingAsync();
        }
        catch (Exception error)
        {
            SaleFormMessage.Text = $"Não foi possível registrar: {error.Message}";
        }
        finally
        {
            SaveSaleButton.IsEnabled = true;
        }
    }

    private void ChooseIxcFileButton_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog
        {
            Title = "Selecionar relatório de vendas do IXC",
            Filter = "Arquivo CSV (*.csv)|*.csv|Todos os arquivos (*.*)|*.*",
            CheckFileExists = true,
            Multiselect = false,
        };
        if (dialog.ShowDialog(this) != true) return;
        var info = new FileInfo(dialog.FileName);
        if (info.Length > 10 * 1024 * 1024)
        {
            IxcImportMessage.Text = "O arquivo excede 10 MB. Exporte um relatório menor.";
            return;
        }
        _ixcFilePath = dialog.FileName;
        _ixcRows.Clear();
        IxcPreviewGrid.ItemsSource = null;
        IxcPreviewGrid.Visibility = Visibility.Collapsed;
        IxcFileNameLabel.Text = info.Name;
        IxcImportMessage.Text = "Arquivo selecionado. Analise para validar antes de importar.";
        AnalyzeIxcButton.IsEnabled = true;
        ImportIxcButton.IsEnabled = false;
    }

    private async void AnalyzeIxcButton_Click(object sender, RoutedEventArgs e)
    {
        if (BranchSelector.SelectedItem is not Branch contextBranch || string.IsNullOrWhiteSpace(_ixcFilePath)) return;
        AnalyzeIxcButton.IsEnabled = false;
        ImportIxcButton.IsEnabled = false;
        IxcImportMessage.Text = "Lendo o CSV e conferindo os vínculos no Supabase…";
        try
        {
            var content = await ReadCsvAsync(_ixcFilePath);
            var rawRows = IxcCsvParser.Parse(content);
            var vendorsTask = _supabase.LoadIxcVendorsAsync();
            var plansTask = _supabase.LoadPlansAsync();
            await Task.WhenAll(vendorsTask, plansTask);
            var vendors = await vendorsTask;
            var plans = await plansTask;
            var activeRows = rawRows.Where(row => IxcCsvParser.Normalize(row.Status) == "ativo" && Regex.IsMatch(row.Contract, @"^\d+$")).ToList();
            var foundContracts = await _supabase.FindIxcContractsAsync(activeRows.Select(row => row.Contract).Distinct().ToArray());
            var existingContracts = foundContracts.Select(row => row.ContractNumber.Trim()).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            _ixcRows = [];
            foreach (var raw in rawRows)
            {
                var item = new IxcImportRow
                {
                    Line = raw.Line, Contract = raw.Contract, IxcBranchCode = raw.BranchCode, HasIxcBranchColumn = raw.HasBranchColumn, Status = raw.Status,
                    Client = raw.Client, PlanDescription = raw.PlanDescription, ActivationDate = raw.ActivationDate,
                    IxcVendorId = raw.IxcVendorId,
                };
                if (IxcCsvParser.Normalize(raw.Status) != "ativo")
                {
                    item.StatusLabel = "Ignorada: contrato não está ativo";
                    _ixcRows.Add(item);
                    continue;
                }
                if (string.IsNullOrWhiteSpace(raw.Contract) || !Regex.IsMatch(raw.Contract, @"^\d+$"))
                {
                    item.StatusLabel = "Bloqueada: ID de contrato inválido";
                    _ixcRows.Add(item);
                    continue;
                }
                if (existingContracts.Contains(raw.Contract) || !seen.Add(raw.Contract))
                {
                    item.IsDuplicate = true;
                    item.StatusLabel = "Duplicada: contrato já registrado ou repetido no arquivo";
                    _ixcRows.Add(item);
                    continue;
                }
                var destination = string.IsNullOrWhiteSpace(raw.BranchCode) && !raw.HasBranchColumn
                    ? contextBranch : ResolveIxcBranch(raw.BranchCode, _branches, contextBranch);
                if (destination is null)
                {
                    item.StatusLabel = string.IsNullOrWhiteSpace(raw.BranchCode)
                        ? "Bloqueada: coluna Filial vazia no relatório"
                        : $"Bloqueada: código de filial IXC {raw.BranchCode} sem correspondência ativa";
                    _ixcRows.Add(item);
                    continue;
                }
                item.DestinationBranchId = destination.Id;
                var sellerMatches = vendors.Where(v => string.Equals(v.IxcVendorId?.Trim(), raw.IxcVendorId, StringComparison.OrdinalIgnoreCase)).ToList();
                if (sellerMatches.Count == 1) item.Vendor = sellerMatches[0];
                item.OriginBranchId = item.Vendor?.BranchId ?? destination.Id;
                item.BranchLabel = $"{_branches.FirstOrDefault(b => b.Id == item.OriginBranchId)?.Name ?? "Origem?"} → {destination.Name}";
                if (!_isSuperAdmin && (_branches.All(b => b.Id != item.OriginBranchId) || _branches.All(b => b.Id != destination.Id)))
                {
                    item.StatusLabel = "Bloqueada: sua conta regional não tem acesso à origem e destino desta venda";
                    _ixcRows.Add(item);
                    continue;
                }

                var activation = raw.ActivationDate;
                if (string.IsNullOrWhiteSpace(activation))
                    activation = Regex.Match(raw.LastUpdated, @"^\d{1,2}/\d{1,2}/\d{4}").Value;
                var matchDate = Regex.Match(activation, @"^(\d{1,2})/(\d{1,2})/(\d{4})$");
                var matchTime = Regex.Match(raw.LastUpdated, @"(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?$");
                if (!matchDate.Success || !matchTime.Success || !DateTime.TryParseExact(
                    $"{matchDate.Groups[1].Value.PadLeft(2, '0')}/{matchDate.Groups[2].Value.PadLeft(2, '0')}/{matchDate.Groups[3].Value} {matchTime.Groups[1].Value.PadLeft(2, '0')}:{matchTime.Groups[2].Value}:{(matchTime.Groups[3].Success ? matchTime.Groups[3].Value : "00")}",
                    "dd/MM/yyyy HH:mm:ss", CultureInfo.InvariantCulture, DateTimeStyles.None, out var localDate))
                {
                    item.StatusLabel = "Bloqueada: data de ativação ou hora da última atualização inválida";
                    _ixcRows.Add(item);
                    continue;
                }
                item.SaleDate = new DateTimeOffset(DateTime.SpecifyKind(localDate, DateTimeKind.Unspecified), TimeZoneInfo.Local.GetUtcOffset(localDate));
                item.Plan = ResolveIxcPlan(raw.PlanDescription, plans);
                item.IsVariableValue = IxcCsvParser.Normalize(raw.PlanDescription).Contains("telefonia nbs")
                    || IxcCsvParser.Normalize(raw.PlanDescription).Contains("padrao uni")
                    || IxcCsvParser.Normalize(raw.PlanDescription).StartsWith("servico ");
                var explicitValue = Regex.Match(raw.PlanDescription, @"(?:r\$\s*)?(\d{1,4}[,.]\d{2})\s*$", RegexOptions.IgnoreCase);
                item.Value = item.IsVariableValue ? 0 : explicitValue.Success
                    ? decimal.Parse(explicitValue.Groups[1].Value.Replace(',', '.'), CultureInfo.InvariantCulture)
                    : item.Plan?.Value ?? 0;
                item.Include = true;
                var issues = new List<string>();
                if (item.Vendor is null) issues.Add(sellerMatches.Count > 1 ? "ID IXC de vendedor não é único" : "Vendedor sem vínculo IXC cadastrado");
                if (item.Plan is null) issues.Add("Plano sem correspondência única");
                if (item.Value == 0 && !item.IsVariableValue) issues.Add("valor não identificado; será enviado para revisão");
                if (item.IsVariableValue) issues.Add("valor variável; será enviado para conferência");
                item.StatusLabel = issues.Count == 0 ? "Pronta para importar" : string.Join(" · ", issues);
                _ixcRows.Add(item);
            }
            IxcPreviewGrid.ItemsSource = _ixcRows;
            IxcPreviewGrid.Visibility = Visibility.Visible;
            var ready = _ixcRows.Count(row => row.Include && row.StatusLabel == "Pronta para importar");
            var review = _ixcRows.Count(row => row.Include && row.StatusLabel != "Pronta para importar");
            var ignored = _ixcRows.Count(row => row.IsDuplicate || !row.Include);
            IxcImportMessage.Text = $"Análise concluída: {ready} venda(s) prontas, {review} para importação com revisão e {ignored} ignorada(s)/bloqueada(s). Revise a tabela antes de confirmar.";
            ImportIxcButton.IsEnabled = _ixcRows.Any(row => row.Include && !row.IsDuplicate && row.SaleDate is not null && row.DestinationBranchId is not null);
            QueueIxcReviewButton.IsEnabled = _ixcRows.Any(IsQueueableIxcRow);
        }
        catch (Exception error)
        {
            IxcImportMessage.Text = $"Não foi possível analisar o arquivo: {error.Message}";
        }
        finally
        {
            AnalyzeIxcButton.IsEnabled = !string.IsNullOrWhiteSpace(_ixcFilePath);
        }
    }

    private async void ImportIxcButton_Click(object sender, RoutedEventArgs e)
    {
        var rows = _ixcRows.Where(row => row.Include && !row.IsDuplicate && !row.Imported && row.SaleDate is not null && row.DestinationBranchId is not null).ToList();
        if (rows.Count == 0) { IxcImportMessage.Text = "Não há linhas selecionadas e válidas para importar."; return; }
        if (MessageBox.Show($"Importar {rows.Count} venda(s) selecionada(s) do arquivo IXC? Contratos repetidos serão recusados pelo servidor.", "Confirmar importação IXC", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
        ImportIxcButton.IsEnabled = false;
        AnalyzeIxcButton.IsEnabled = false;
        var imported = 0;
        var failed = 0;
        foreach (var row in rows)
        {
            try
            {
                var sale = new Dictionary<string, object?>
                {
                    ["vendedor_id"] = row.Vendor?.Id,
                    ["filial_origem_id"] = row.OriginBranchId,
                    ["filial_destino_id"] = row.DestinationBranchId,
                    ["plano_id"] = row.Plan?.Id,
                    ["data_venda"] = row.SaleDate?.ToString("O", CultureInfo.InvariantCulture),
                    ["valor"] = row.Value,
                    ["cliente"] = row.Client,
                    ["cliente"] = row.Client,
                    ["numero_venda"] = row.Contract,
                    ["observacao"] = $"Importado do IXC; filial IXC {row.IxcBranchCode}; descrição original do plano: {row.PlanDescription}",
                    ["fora_filial"] = false,
                };
                if (row.IsVariableValue && row.Plan is not null && row.Vendor is not null)
                {
                    await _supabase.InvokeRpcAsync("importar_venda_variavel_ixc", new { p_venda = sale });
                }
                else if (row.Vendor is null || row.Plan is null || (row.Value == 0 && !row.IsVariableValue))
                {
                    var source = new Dictionary<string, object?>
                    {
                        ["contrato"] = row.Contract, ["cliente"] = row.Client, ["descricaoPlano"] = row.PlanDescription,
                        ["ixcVendedorId"] = row.IxcVendorId, ["codigoFilialIxc"] = row.IxcBranchCode,
                        ["dataAtivacao"] = row.ActivationDate, ["ultimaAtualizacao"] = row.SaleDate?.ToString("O"),
                        ["status"] = row.Status, ["linha"] = row.Line,
                    };
                    var review = new Dictionary<string, object?>
                    {
                        ["filial_contexto_id"] = BranchSelector.SelectedItem is Branch selected ? selected.Id : null,
                        ["chave_origem"] = $"contrato:{row.Contract}",
                        ["descricao_plano"] = row.PlanDescription,
                        ["vendedor_ixc_id"] = row.IxcVendorId,
                        ["filial_ixc_id"] = row.IxcBranchCode,
                        ["motivo"] = row.StatusLabel,
                        ["dados_origem"] = source,
                    };
                    await _supabase.InvokeRpcAsync("registrar_venda_ixc_com_revisao", new { p_venda = sale, p_revisao = review });
                }
                else
                {
                    await _supabase.CreateSaleAsync(new SaleRequest
                    {
                        VendorId = row.Vendor.Id, OriginBranchId = row.OriginBranchId ?? row.DestinationBranchId!.Value,
                        DestinationBranchId = row.DestinationBranchId!.Value, PlanId = row.Plan!.Id,
                        SaleDate = row.SaleDate!.Value, Value = row.Value, ContractNumber = row.Contract,
                        Notes = $"Cliente: {row.Client} — Importado do IXC; descrição original do plano: {row.PlanDescription}",
                    });
                }
                row.Imported = true;
                row.Include = false;
                row.StatusLabel = "Importada com sucesso";
                imported++;
            }
            catch (Exception error)
            {
                row.StatusLabel = $"Falha: {error.Message}";
                failed++;
            }
            IxcPreviewGrid.Items.Refresh();
            IxcImportMessage.Text = $"Importando… {imported} concluída(s), {failed} falha(s) de {rows.Count}.";
        }
        IxcImportMessage.Text = $"Importação concluída: {imported} venda(s) gravada(s), {failed} falha(s). As linhas com falha continuam na prévia para nova tentativa.";
        ImportIxcButton.IsEnabled = _ixcRows.Any(row => row.Include && !row.Imported && !row.IsDuplicate && row.SaleDate is not null);
        AnalyzeIxcButton.IsEnabled = true;
        if (imported > 0) await LoadMonthlyRankingAsync();
    }

    private static bool IsQueueableIxcRow(IxcImportRow row) =>
        IxcCsvParser.Normalize(row.Status) == "ativo" && !row.IsDuplicate && !row.Imported &&
        (row.SaleDate is null || row.DestinationBranchId is null || !Regex.IsMatch(row.Contract, @"^\d+$"));

    private async void QueueIxcReviewButton_Click(object sender, RoutedEventArgs e)
    {
        if (BranchSelector.SelectedItem is not Branch context) return;
        var blocked = _ixcRows.Where(IsQueueableIxcRow).ToList();
        if (blocked.Count == 0) { IxcImportMessage.Text = "Não há linhas bloqueadas para revisão."; return; }
        QueueIxcReviewButton.IsEnabled = false;
        ImportIxcButton.IsEnabled = false;
        try
        {
            var payload = blocked.Select(row => (object)new Dictionary<string, object?>
            {
                ["filial_contexto_id"] = context.Id,
                ["chave_origem"] = string.IsNullOrWhiteSpace(row.Contract) ? $"linha:{row.Line}:{row.Client}:{row.PlanDescription}" : $"contrato:{row.Contract}",
                ["numero_venda"] = string.IsNullOrWhiteSpace(row.Contract) ? null : row.Contract,
                ["cliente"] = string.IsNullOrWhiteSpace(row.Client) ? null : row.Client,
                ["descricao_plano"] = string.IsNullOrWhiteSpace(row.PlanDescription) ? null : row.PlanDescription,
                ["vendedor_ixc_id"] = string.IsNullOrWhiteSpace(row.IxcVendorId) ? null : row.IxcVendorId,
                ["filial_ixc_id"] = string.IsNullOrWhiteSpace(row.IxcBranchCode) ? null : row.IxcBranchCode,
                ["motivo"] = row.StatusLabel,
                ["dados_origem"] = new Dictionary<string, object?>
                {
                    ["contrato"] = row.Contract, ["cliente"] = row.Client, ["descricaoPlano"] = row.PlanDescription,
                    ["ixcVendedorId"] = row.IxcVendorId, ["codigoFilialIxc"] = row.IxcBranchCode,
                    ["dataAtivacao"] = row.ActivationDate, ["ultimaAtualizacao"] = row.LastUpdated,
                    ["status"] = row.Status, ["linha"] = row.Line,
                },
                ["situacao"] = "pendente",
            }).ToList();
            var count = await _supabase.QueueIxcReviewRowsAsync(payload);
            foreach (var row in blocked) row.StatusLabel += " · enviada à fila de revisão";
            IxcPreviewGrid.Items.Refresh();
            IxcImportMessage.Text = $"{count} linha(s) incompleta(s) enviada(s) à fila de revisão. Nenhuma venda foi criada para essas linhas.";
            QueueIxcReviewButton.IsEnabled = false;
        }
        catch (Exception error)
        {
            IxcImportMessage.Text = $"Não foi possível enviar à fila: {error.Message}";
            QueueIxcReviewButton.IsEnabled = true;
        }
        finally
        {
            ImportIxcButton.IsEnabled = _ixcRows.Any(row => row.Include && !row.IsDuplicate && row.SaleDate is not null && row.DestinationBranchId is not null);
        }
    }

    private void ChooseRenewalFileButton_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog
        {
            Title = "Selecionar relatório de renovações",
            Filter = "Relatório CSV (*.csv)|*.csv|Todos os arquivos (*.*)|*.*",
            CheckFileExists = true,
            Multiselect = false,
        };
        if (dialog.ShowDialog(this) != true) return;
        var info = new FileInfo(dialog.FileName);
        if (info.Length > 10 * 1024 * 1024) { RenewalImportMessage.Text = "O arquivo excede 10 MB. Exporte um relatório menor."; return; }
        _renewalFilePath = dialog.FileName;
        _renewalRows.Clear();
        RenewalPreviewGrid.ItemsSource = null;
        RenewalPreviewGrid.Visibility = Visibility.Collapsed;
        RenewalFileNameLabel.Text = info.Name;
        RenewalImportMessage.Text = "Arquivo selecionado. Analise para conferir duplicidades e vínculos.";
        AnalyzeRenewalButton.IsEnabled = true;
        ImportRenewalButton.IsEnabled = false;
    }

    private async void AnalyzeRenewalButton_Click(object sender, RoutedEventArgs e)
    {
        if (BranchSelector.SelectedItem is not Branch branch || string.IsNullOrWhiteSpace(_renewalFilePath)) return;
        AnalyzeRenewalButton.IsEnabled = false;
        ImportRenewalButton.IsEnabled = false;
        try
        {
            var matrix = IxcCsvParser.ReadRows(await ReadCsvAsync(_renewalFilePath));
            if (matrix.Count < 2) throw new InvalidDataException("O arquivo não contém cabeçalho e dados de renovação.");
            var headers = matrix[0].Select(IxcCsvParser.Normalize).ToArray();
            int Column(string[] aliases, string pattern)
            {
                var exact = Array.FindIndex(headers, header => aliases.Contains(header, StringComparer.Ordinal));
                return exact >= 0 ? exact : Array.FindIndex(headers, header => Regex.IsMatch(header, pattern));
            }
            var contractColumn = Column(["id", "contrato", "numero contrato", "numero do contrato", "contrato renovado", "id contrato"], "^(id|numero contrato|contrato|contrato renovado)$");
            var clientColumn = Column(["cliente", "nome cliente", "assinante"], "cliente|assinante");
            var planColumn = Column(["plano", "descricao", "descricao plano", "plano renovado", "novo plano"], "plano|descricao|produto");
            var sellerColumn = Column(["vendedor", "id vendedor", "codigo vendedor", "consultor"], "vendedor|consultor|responsavel");
            var valueColumn = Column(["valor", "valor plano", "mensalidade", "preco", "valor mensal"], "valor|mensalidade|preco");
            var dateColumn = Column(["data renovacao", "data da renovacao", "data de renovacao", "data evento", "data do evento", "data"], "data (?:(da|de) )?renova|data do evento|data evento");
            if (contractColumn < 0 || clientColumn < 0 || planColumn < 0 || sellerColumn < 0 || dateColumn < 0)
                throw new InvalidDataException("Não reconheci as colunas necessárias. O relatório precisa conter contrato, cliente, plano, vendedor e data da renovação.");
            if (headers.Contains("status contrato") && !headers.Any(header => Regex.IsMatch(header, "data (?:(da|de) )?renova")))
                throw new InvalidDataException("Este arquivo parece uma lista de contratos ativos, não um relatório de eventos de renovação.");
            var monthDate = RenewalMonthInput.SelectedDate ?? DateTime.Today;
            var existingTask = _supabase.LoadRenewalContractsAsync(branch.Id, monthDate.Month, monthDate.Year);
            var vendorsTask = _supabase.LoadIxcVendorsAsync();
            var plansTask = _supabase.LoadPlansAsync();
            await Task.WhenAll(existingTask, vendorsTask, plansTask);
            var existing = await existingTask;
            var vendors = await vendorsTask;
            var plans = await plansTask;
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            _renewalRows = [];
            foreach (var (cells, index) in matrix.Skip(1).Select((cells, index) => (cells, index)))
            {
                string Cell(int column) => column >= 0 && column < cells.Length ? cells[column].Trim() : string.Empty;
                var contract = Regex.Replace(Cell(contractColumn), @"\s+", "");
                if (contract.Length == 0 && cells.All(string.IsNullOrWhiteSpace)) continue;
                var sellerRef = Cell(sellerColumn);
                var sellerIdMatches = vendors.Where(item => string.Equals(item.IxcVendorId?.Trim(), sellerRef, StringComparison.OrdinalIgnoreCase)).ToList();
                var sellerNameMatches = vendors.Where(item => IxcCsvParser.Normalize(item.Name) == IxcCsvParser.Normalize(sellerRef)).ToList();
                var vendor = sellerIdMatches.Count == 1 ? sellerIdMatches[0] : sellerIdMatches.Count == 0 && sellerNameMatches.Count == 1 ? sellerNameMatches[0] : null;
                var planDescription = Cell(planColumn);
                var plan = ResolveIxcPlan(planDescription, plans);
                var rawDate = Cell(dateColumn);
                var date = DateOnly.TryParseExact(rawDate, ["d/M/yyyy", "dd/MM/yyyy", "d-M-yyyy", "yyyy-MM-dd"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate)
                    ? parsedDate : (DateOnly?)null;
                var value = valueColumn >= 0 ? ParseRenewalValue(Cell(valueColumn)) : null;
                if (value is null)
                {
                    var explicitPrice = Regex.Match(planDescription, @"(?:r\$\s*)?(\d{1,4}[,.]\d{2})\s*$", RegexOptions.IgnoreCase);
                    if (explicitPrice.Success && decimal.TryParse(explicitPrice.Groups[1].Value.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsedPrice)) value = parsedPrice;
                    else if (plan is not null) value = plan.Value;
                }
                var normalizedContract = contract;
                var duplicate = existing.Contains(normalizedContract) || (normalizedContract.Length > 0 && !seen.Add(normalizedContract));
                if (normalizedContract.Length > 0) seen.Add(normalizedContract);
                var needsReview = plan is null || value is null or 0 || IxcCsvParser.Normalize(planDescription).Contains("telefonia nbs") || IxcCsvParser.Normalize(planDescription).Contains("padrao uni") || IxcCsvParser.Normalize(planDescription).StartsWith("servico");
                var row = new RenewalImportRow
                {
                    Line = index + 2, Contract = contract, Client = Cell(clientColumn), PlanDescription = planDescription,
                    SellerReference = sellerRef, DateText = date?.ToString("yyyy-MM-dd") ?? string.Empty,
                    VendorId = vendor?.Id, VendorName = vendor?.Name ?? string.Empty,
                    PlanId = plan?.Id, PlanName = plan?.Name ?? planDescription, Value = value ?? 0,
                    NeedsReview = needsReview, Duplicate = duplicate,
                };
                if (duplicate) row.Error = "Duplicada: contrato já importado neste mês ou repetido no arquivo";
                else if (contract.Length == 0) row.Error = "Contrato não identificado";
                else if (row.Client.Length == 0) row.Error = "Cliente não identificado";
                else if (planDescription.Length == 0) row.Error = "Plano não identificado";
                else if (vendor is null) row.Error = sellerIdMatches.Count > 1 || sellerNameMatches.Count > 1 ? "Vendedor associado a mais de um cadastro" : $"ID/nome de vendedor sem cadastro: {sellerRef}";
                else if (date is null) row.Error = "Data da renovação inválida";
                else if (date.Value.Month != monthDate.Month || date.Value.Year != monthDate.Year) row.Error = "Data fora do mês selecionado";
                else row.Include = true;
                _renewalRows.Add(row);
            }
            RenewalPreviewGrid.ItemsSource = _renewalRows;
            RenewalPreviewGrid.Visibility = Visibility.Visible;
            var valid = _renewalRows.Count(row => row.Include);
            var invalid = _renewalRows.Count(row => !row.Duplicate && !string.IsNullOrEmpty(row.Error));
            var duplicates = _renewalRows.Count(row => row.Duplicate);
            var review = _renewalRows.Count(row => row.Include && row.NeedsReview);
            RenewalImportMessage.Text = $"Análise: {valid} renovação(ões) válidas; {review} irá(ão) para conferência de plano/valor; {duplicates} duplicada(s); {invalid} linha(s) precisam de correção.";
            ImportRenewalButton.IsEnabled = valid > 0 && invalid == 0;
        }
        catch (Exception error)
        {
            RenewalImportMessage.Text = $"Não foi possível analisar o relatório: {error.Message}";
            RenewalPreviewGrid.Visibility = Visibility.Collapsed;
        }
        finally { AnalyzeRenewalButton.IsEnabled = true; }
    }

    private async void ImportRenewalButton_Click(object sender, RoutedEventArgs e)
    {
        if (BranchSelector.SelectedItem is not Branch branch || RenewalMonthInput.SelectedDate is not DateTime selectedMonth) return;
        var selected = _renewalRows.Where(row => row.Include && !row.Duplicate && string.IsNullOrEmpty(row.Error)).ToList();
        if (selected.Count == 0) { RenewalImportMessage.Text = "Não há renovações selecionadas para importar."; return; }
        if (MessageBox.Show($"Importar {selected.Count} renovação(ões) para {branch.Name} em {selectedMonth:MM/yyyy}? Os registros anteriores serão preservados e duplicados ignorados.", "Confirmar importação", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
        ImportRenewalButton.IsEnabled = false;
        AnalyzeRenewalButton.IsEnabled = false;
        RenewalImportMessage.Text = "Importando renovações e conferindo duplicidades no servidor…";
        try
        {
            var records = selected.Select(row => (object)new Dictionary<string, object?>
            {
                ["vendedor_id"] = row.VendorId, ["contrato"] = row.Contract, ["cliente"] = row.Client,
                ["plano"] = row.PlanName, ["plano_id"] = row.PlanId, ["valor"] = row.Value,
                ["data"] = row.DateText, ["conferencia_pendente"] = row.NeedsReview,
            }).ToList();
            var result = await _supabase.InvokeRpcResultAsync("substituir_registros_renovacao", new
            {
                p_filial_id = branch.Id, p_mes = selectedMonth.Month, p_ano = selectedMonth.Year,
                p_arquivo = Path.GetFileName(_renewalFilePath ?? "relatorio.csv"), p_linhas = records,
            });
            var count = result is { ValueKind: JsonValueKind.Number } json ? json.GetInt32() : selected.Count;
            foreach (var row in selected) { row.Include = false; row.Error = "Importada"; }
            RenewalPreviewGrid.Items.Refresh();
            RenewalImportMessage.Text = $"Importação concluída: {count} renovação(ões) novas. Itens sem plano ou valor confirmado foram sinalizados para conferência.";
            await LoadMonthlyRankingAsync();
        }
        catch (Exception error)
        {
            RenewalImportMessage.Text = $"Não foi possível importar. Confira se substituir_registros_renovacao está instalada no Supabase. Detalhe: {error.Message}";
        }
        finally { AnalyzeRenewalButton.IsEnabled = true; ImportRenewalButton.IsEnabled = true; }
    }

    private static decimal? ParseRenewalValue(string raw)
    {
        var value = raw.Trim().Replace("R$", "", StringComparison.OrdinalIgnoreCase).Replace(" ", "");
        if (value.Length == 0) return null;
        if (value.Contains(',')) value = value.Replace(".", "").Replace(',', '.');
        return decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed) && parsed >= 0 ? parsed : null;
    }

    private async Task LoadCommercialOptionsAsync()
    {
        if (BranchSelector.SelectedItem is not Branch branch) return;
        try
        {
            var vendorsTask = _supabase.LoadVendorsAsync(branch.Id);
            var plansTask = _supabase.LoadPlansAsync();
            var productsTask = _supabase.LoadAdditionalProductsAsync();
            await Task.WhenAll(vendorsTask, plansTask, productsTask);
            if (BranchSelector.SelectedItem is not Branch selected || selected.Id != branch.Id) return;
            var vendors = await vendorsTask;
            var plans = await plansTask;
            var products = await productsTask;
            AdditionalVendorSelector.ItemsSource = vendors;
            AdditionalProductSelector.ItemsSource = products;
            ReceivedPlanSelector.ItemsSource = plans.Where(plan => plan.Active).ToList();
            AdditionalBranchHint.Text = $"O registro avulso será vinculado a {branch.Name}.";
            ReceivedBranchHint.Text = $"A venda será contabilizada para a meta global de {branch.Name}, sem atribuição individual.";
            AdditionalDateInput.SelectedDate ??= DateTime.Today;
            ReceivedDateInput.SelectedDate ??= DateTime.Today;
            if (products.Count == 0) AdditionalMessage.Text = "Nenhum produto adicional ativo foi encontrado.";
        }
        catch (Exception error)
        {
            AdditionalMessage.Text = $"Não foi possível carregar os produtos e vendedores: {error.Message}";
            ReceivedMessage.Text = $"Não foi possível carregar os planos: {error.Message}";
        }
    }

    private async Task LoadVendorsManagementAsync()
    {
        if (BranchSelector.SelectedItem is not Branch branch) return;
        VendorsBranchHint.Text = $"Cadastro e participação no ranking em {branch.Name}.";
        VendorsMessage.Text = "Carregando vendedores…";
        try
        {
            _managedVendors = await _supabase.LoadVendorManagementAsync(branch.Id);
            if (BranchSelector.SelectedItem is not Branch selected || selected.Id != branch.Id) return;
            VendorsGrid.ItemsSource = _managedVendors;
            VendorsMessage.Text = $"{_managedVendors.Count} vendedor(es) no cadastro. As permissões de edição dependem do acesso da sua conta no Supabase.";
        }
        catch (Exception error) { VendorsMessage.Text = $"Não foi possível carregar vendedores: {error.Message}"; }
    }

    private async void SaveVendorsButton_Click(object sender, RoutedEventArgs e)
    {
        if (BranchSelector.SelectedItem is not Branch branch) return;
        VendorsGrid.CommitEdit(System.Windows.Controls.DataGridEditingUnit.Cell, true);
        VendorsGrid.CommitEdit(System.Windows.Controls.DataGridEditingUnit.Row, true);
        SaveVendorsButton.IsEnabled = false;
        var saved = 0;
        try
        {
            foreach (var vendor in _managedVendors)
            {
                if (string.IsNullOrWhiteSpace(vendor.Name) || vendor.Type is not ("interno" or "externo"))
                    throw new InvalidOperationException($"Confira o nome e o tipo de {vendor.Name}. Use interno ou externo.");
                await _supabase.UpdateVendorAsync(vendor, branch.Id);
                saved++;
            }
            VendorsMessage.Text = $"Alterações salvas em {saved} vendedor(es).";
        }
        catch (Exception error)
        {
            VendorsMessage.Text = saved > 0
                ? $"Foram salvos {saved} vendedor(es), mas uma alteração foi recusada: {error.Message}"
                : $"Não foi possível salvar. Verifique a permissão de edição desta conta: {error.Message}";
        }
        finally { SaveVendorsButton.IsEnabled = true; }
    }

    private async void CreateVendorButton_Click(object sender, RoutedEventArgs e)
    {
        if (BranchSelector.SelectedItem is not Branch branch) return;
        var name = NewVendorNameInput.Text.Trim();
        var type = (NewVendorTypeSelector.SelectedItem as System.Windows.Controls.ComboBoxItem)?.Content?.ToString() ?? "interno";
        if (name.Length < 2)
        {
            VendorsMessage.Text = "Informe o nome do vendedor.";
            NewVendorNameInput.Focus();
            return;
        }
        CreateVendorButton.IsEnabled = false;
        try
        {
            var synced = await _supabase.CreateVendorAsync(name, type, NewVendorIxcInput.Text, NewVendorRankingCheck.IsChecked == true, branch);
            NewVendorNameInput.Clear();
            NewVendorIxcInput.Clear();
            NewVendorRankingCheck.IsChecked = true;
            await LoadVendorsManagementAsync();
            if (!synced && type == "interno")
                VendorsMessage.Text = $"{name} foi cadastrado. A meta de renovação compartilhada não pôde ser sincronizada; revise a configuração de metas.";
        }
        catch (Exception error)
        {
            VendorsMessage.Text = $"Não foi possível cadastrar. Confira se a conta tem permissão de criação: {error.Message}";
        }
        finally { CreateVendorButton.IsEnabled = true; }
    }

    private void AdditionalProductSelector_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (AdditionalProductSelector.SelectedItem is AdditionalProduct product)
            AdditionalValueInput.Text = product.Value.ToString("0.00", CultureInfo.GetCultureInfo("pt-BR"));
    }

    private void ReceivedPlanSelector_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (ReceivedPlanSelector.SelectedItem is Plan plan)
            ReceivedValueInput.Text = (plan.Value ?? 0).ToString("0.00", CultureInfo.GetCultureInfo("pt-BR"));
    }

    private async void SaveAdditionalButton_Click(object sender, RoutedEventArgs e)
    {
        if (AdditionalProductSelector.SelectedItem is not AdditionalProduct product || AdditionalDateInput.SelectedDate is not DateTime date)
        {
            AdditionalMessage.Text = "Selecione um produto adicional e informe a data.";
            return;
        }
        if (!int.TryParse(AdditionalQuantityInput.Text, out var quantity) || quantity < 1 || !TryReadCurrency(AdditionalValueInput.Text, out var value) || value < 0)
        {
            AdditionalMessage.Text = "Informe quantidade maior que zero e um valor válido.";
            return;
        }
        SaveAdditionalButton.IsEnabled = false;
        try
        {
            var vendorId = (AdditionalVendorSelector.SelectedItem as Vendor)?.Id;
            await _supabase.CreateStandaloneAdditionalAsync(vendorId, product.Id, DateOnly.FromDateTime(date), quantity, value, string.IsNullOrWhiteSpace(AdditionalNotesInput.Text) ? null : AdditionalNotesInput.Text.Trim());
            AdditionalMessage.Text = "Adicional registrado com sucesso.";
            AdditionalVendorSelector.SelectedItem = null;
            AdditionalProductSelector.SelectedItem = null;
            AdditionalQuantityInput.Text = "1";
            AdditionalValueInput.Clear();
            AdditionalNotesInput.Clear();
        }
        catch (Exception error) { AdditionalMessage.Text = $"Não foi possível registrar: {error.Message}"; }
        finally { SaveAdditionalButton.IsEnabled = true; }
    }

    private async void SaveReceivedButton_Click(object sender, RoutedEventArgs e)
    {
        if (BranchSelector.SelectedItem is not Branch branch || ReceivedPlanSelector.SelectedItem is not Plan plan || ReceivedDateInput.SelectedDate is not DateTime date)
        {
            ReceivedMessage.Text = "Selecione um plano e informe a data.";
            return;
        }
        if (!int.TryParse(ReceivedQuantityInput.Text, out var quantity) || quantity < 1 || !TryReadCurrency(ReceivedValueInput.Text, out var value) || value < 0)
        {
            ReceivedMessage.Text = "Informe quantidade maior que zero e um valor unitário válido.";
            return;
        }
        SaveReceivedButton.IsEnabled = false;
        try
        {
            await _supabase.CreateReceivedSaleAsync(branch.Id, plan.Id, DateOnly.FromDateTime(date), quantity, value, string.IsNullOrWhiteSpace(ReceivedNotesInput.Text) ? null : ReceivedNotesInput.Text.Trim());
            ReceivedMessage.Text = $"Venda recebida registrada: {quantity} × {value.ToString("C2", CultureInfo.GetCultureInfo("pt-BR"))}.";
            ReceivedQuantityInput.Text = "1";
            ReceivedNotesInput.Clear();
        }
        catch (Exception error) { ReceivedMessage.Text = $"Não foi possível registrar: {error.Message}"; }
        finally { SaveReceivedButton.IsEnabled = true; }
    }

    private static bool TryReadCurrency(string raw, out decimal value)
    {
        var text = raw.Trim().Replace("R$", "", StringComparison.OrdinalIgnoreCase).Trim();
        return decimal.TryParse(text, NumberStyles.Number, CultureInfo.GetCultureInfo("pt-BR"), out value)
            || decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out value);
    }

    private static async Task<string> ReadCsvAsync(string path)
    {
        var bytes = await File.ReadAllBytesAsync(path);
        try { return new UTF8Encoding(false, true).GetString(bytes); }
        catch (DecoderFallbackException)
        {
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
            return Encoding.GetEncoding(1252).GetString(bytes);
        }
    }

    private static Branch? ResolveIxcBranch(string code, IReadOnlyList<Branch> branches, Branch selected)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;
        var aliases = code switch
        {
            "6" => new[] { "ji parana" }, "7" => new[] { "machadinho" }, "8" => new[] { "rolim de moura" },
            "9" => new[] { "jaru" }, "10" => new[] { "ouro preto" }, "11" => new[] { "nova brasilandia" },
            "12" => new[] { "presidente medici", "presidente medice" }, "14" => new[] { "alvorada" },
            "15" => new[] { "alta floresta" }, "16" or "17" or "18" => new[] { "sao francisco" }, _ => []
        };
        if (aliases.Length == 0) return null;
        var matches = branches.Where(branch => aliases.Any(alias => IxcCsvParser.Normalize(branch.Name).Contains(alias, StringComparison.Ordinal))).ToList();
        return matches.Count == 1 ? matches[0] : null;
    }

    private static Plan? ResolveIxcPlan(string description, IReadOnlyList<Plan> plans)
    {
        var normalizedDescription = IxcCsvParser.Normalize(Regex.Replace(description, @"(?:r\$\s*)?\d{1,4}[,.]\d{2}\s*$", "", RegexOptions.IgnoreCase));
        if (normalizedDescription.StartsWith("plano ")) normalizedDescription = normalizedDescription[6..].Trim();
        var exact = plans.Where(plan =>
        {
            var name = IxcCsvParser.Normalize(plan.Name);
            if (name.StartsWith("plano ")) name = name[6..].Trim();
            return name == normalizedDescription || IxcCsvParser.Normalize($"{name} {plan.SpeedMbps}mb") == normalizedDescription;
        }).ToList();
        var active = exact.Where(plan => plan.Active).ToList();
        if (active.Count == 1) return active[0];
        if (active.Count > 1) return null;
        return exact.Count == 1 ? exact[0] : null;
    }

    private static IEnumerable<T> FindVisualChildren<T>(DependencyObject parent) where T : DependencyObject
    {
        var count = VisualTreeHelper.GetChildrenCount(parent);
        for (var index = 0; index < count; index++)
        {
            var child = VisualTreeHelper.GetChild(parent, index);
            if (child is T typedChild) yield return typedChild;
            foreach (var descendant in FindVisualChildren<T>(child)) yield return descendant;
        }
    }

    private async Task LoadMonthlyRankingAsync()
    {
        if (BranchSelector.SelectedItem is not Branch branch || _supabase is null) return;
        var requestVersion = ++_rankingLoadVersion;
        var now = DateTime.Now;
        var cultura = System.Globalization.CultureInfo.GetCultureInfo("pt-BR");
        RankingPeriodLabel.Text = now.ToString("MMMM 'de' yyyy", cultura);
        DashboardMessage.Text = $"Carregando o ranking de {branch.Name}…";
        TotalSalesMetric.Text = "—";
        VendorCountMetric.Text = "—";
        MonthlyLeaderMetric.Text = "—";
        RankingGrid.ItemsSource = null;
        try
        {
            var ranking = await _supabase.LoadMonthlyRankingAsync(branch.Id, now.Month, now.Year);
            if (requestVersion != _rankingLoadVersion || BranchSelector.SelectedItem is not Branch selecionada || selecionada.Id != branch.Id) return;
            var ordenado = ranking.OrderByDescending(row => row.Sales)
                .ThenByDescending(row => row.SalesValue)
                .ThenBy(row => row.VendorName)
                .ToList();
            for (var index = 0; index < ordenado.Count; index++) ordenado[index].Position = index + 1;
            RankingGrid.ItemsSource = ordenado;
            TotalSalesMetric.Text = ordenado.Sum(row => row.Sales).ToString("N0", cultura);
            VendorCountMetric.Text = ordenado.Count.ToString("N0", cultura);
            MonthlyLeaderMetric.Text = ordenado.FirstOrDefault()?.VendorName ?? "Sem vendas";
            DashboardMessage.Text = ordenado.Count == 0
                ? "Ainda não há pessoas no ranking deste período."
                : "Ranking mensal carregado do Supabase.";
        }
        catch (Exception error)
        {
            if (requestVersion != _rankingLoadVersion) return;
            DashboardMessage.Text = $"Não foi possível carregar o ranking: {error.Message}";
        }
    }

    private void SignOutButton_Click(object sender, RoutedEventArgs e)
    {
        _supabase.SignOut();
        _isSuperAdmin = false;
        BranchSelector.ItemsSource = null;
        _branches = [];
        RankingGrid.ItemsSource = null;
        _rankingLoadVersion++;
        DashboardView.Visibility = Visibility.Collapsed;
        LoginView.Visibility = Visibility.Visible;
        EmailInput.Focus();
    }

    private void ShowLoginError(string message)
    {
        LoginError.Text = message;
        LoginError.Visibility = Visibility.Visible;
    }
}

using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Globalization;
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
            await Task.WhenAll(vendorsTask, plansTask);
            if (BranchSelector.SelectedItem is not Branch current || current.Id != branch.Id || _currentModule != "nova-venda") return;
            var vendors = await vendorsTask;
            var plans = await plansTask;
            SaleVendorSelector.ItemsSource = vendors;
            SalePlanSelector.ItemsSource = plans;
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
        if (SalePlanSelector.SelectedItem is Plan plan) SaleValueInput.Text = plan.Value.ToString("0.00", CultureInfo.GetCultureInfo("pt-BR"));
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
            await _supabase.CreateSaleAsync(sale);
            SaleFormMessage.Text = "Venda registrada com sucesso. Atualizando o ranking…";
            ResetSaleButton_Click(this, new RoutedEventArgs());
            SaleFormMessage.Text = "Venda registrada. Confira o ranking atualizado abaixo ou volte ao painel.";
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

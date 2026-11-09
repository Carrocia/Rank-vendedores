using System.Text.Json.Serialization;

namespace RankVendedores.Admin.Models;

public sealed class AdminProfile
{
    [JsonPropertyName("user_id")] public Guid UserId { get; init; }
    [JsonPropertyName("filial_id")] public long? BranchId { get; init; }
    [JsonPropertyName("is_superadmin")] public bool IsSuperAdmin { get; init; }
    [JsonPropertyName("ativo")] public bool Active { get; init; }
}

public sealed class Branch
{
    [JsonPropertyName("id")] public long Id { get; init; }
    [JsonPropertyName("nome")] public string Name { get; init; } = string.Empty;
    [JsonPropertyName("ativo")] public bool Active { get; init; }
    public override string ToString() => Name;
}

public sealed class MonthlyRankingRow
{
    [JsonPropertyName("vendedor_id")] public long? VendorId { get; init; }
    [JsonPropertyName("vendedor_nome")] public string VendorName { get; init; } = string.Empty;
    [JsonPropertyName("tipo")] public string Type { get; init; } = string.Empty;
    [JsonPropertyName("vendas")] public long Sales { get; init; }
    [JsonPropertyName("valor_vendas")] public decimal SalesValue { get; init; }
    [JsonPropertyName("meta_vendas")] public decimal SalesTarget { get; init; }
    [JsonPropertyName("renovacoes")] public long Renewals { get; init; }
    [JsonPropertyName("rank_mensal")] public string MonthlyRank { get; init; } = string.Empty;
    public int Position { get; set; }
    public string TypeLabel => Type == "interno" ? "Interno" : "Externo";
    public string TargetLabel => SalesTarget > 0 ? SalesTarget.ToString("0.##", System.Globalization.CultureInfo.GetCultureInfo("pt-BR")) : "—";
    public string GoalProgressLabel => SalesTarget > 0 ? $"{Sales / SalesTarget:P0}" : "—";
    public string RankLabel => string.IsNullOrWhiteSpace(MonthlyRank) ? "—" : MonthlyRank;
}

public sealed class Vendor
{
    [JsonPropertyName("id")] public long Id { get; init; }
    [JsonPropertyName("nome")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("tipo")] public string Type { get; set; } = string.Empty;
    [JsonPropertyName("filial_id")] public long? BranchId { get; init; }
    [JsonPropertyName("ixc_vendedor_id")] public string? IxcVendorId { get; set; }
    [JsonPropertyName("ativo")] public bool Active { get; set; } = true;
    [JsonPropertyName("participa_ranking")] public bool ParticipatesInRanking { get; set; } = true;
    public string TypeLabel => Type == "interno" ? "Interno" : "Externo";
    public override string ToString() => $"{Name} · {TypeLabel}";
}

public sealed class Plan
{
    [JsonPropertyName("id")] public long Id { get; init; }
    [JsonPropertyName("nome")] public string Name { get; init; } = string.Empty;
    [JsonPropertyName("valor")] public decimal? Value { get; init; }
    [JsonPropertyName("velocidade_mb")] public int? SpeedMbps { get; init; }
    [JsonPropertyName("eh_servico")] public bool IsService { get; init; }
    [JsonPropertyName("ativo")] public bool Active { get; init; } = true;
    [JsonPropertyName("categoria")] public string? Category { get; init; }
    [JsonPropertyName("tipo")] public string? Type { get; init; }
    public string Label => $"{Name}{(!IsService && SpeedMbps is > 0 ? $" · {SpeedMbps} Mbps" : string.Empty)} · {(Value ?? 0).ToString("C2", System.Globalization.CultureInfo.GetCultureInfo("pt-BR"))}";
    public override string ToString() => Label;
}

public sealed class IxcImportRow
{
    public int Line { get; init; }
    public string Contract { get; init; } = string.Empty;
    public string IxcBranchCode { get; init; } = string.Empty;
    public bool HasIxcBranchColumn { get; init; }
    public string Status { get; init; } = string.Empty;
    public string Client { get; init; } = string.Empty;
    public string PlanDescription { get; init; } = string.Empty;
    public string ActivationDate { get; init; } = string.Empty;
    public string IxcVendorId { get; init; } = string.Empty;
    public string LastUpdated { get; init; } = string.Empty;
    public long? DestinationBranchId { get; set; }
    public long? OriginBranchId { get; set; }
    public string BranchLabel { get; set; } = string.Empty;
    public DateTimeOffset? SaleDate { get; set; }
    public Vendor? Vendor { get; set; }
    public Plan? Plan { get; set; }
    public decimal Value { get; set; }
    public bool IsVariableValue { get; set; }
    public bool IsDuplicate { get; set; }
    public bool Include { get; set; }
    public bool Imported { get; set; }
    public string StatusLabel { get; set; } = string.Empty;
    public string PlanLabel => Plan?.Name ?? PlanDescription;
    public string VendorLabel => Vendor?.Name ?? (string.IsNullOrWhiteSpace(IxcVendorId) ? "Sem ID IXC" : $"IXC {IxcVendorId}");
    public string ValueLabel => Value.ToString("C2", System.Globalization.CultureInfo.GetCultureInfo("pt-BR"));
    public string DateLabel => SaleDate?.ToLocalTime().ToString("dd/MM/yyyy HH:mm") ?? "—";
}

public sealed class IxcExistingContract
{
    [JsonPropertyName("numero_venda")] public string ContractNumber { get; init; } = string.Empty;
    [JsonPropertyName("filial_destino_nome")] public string BranchName { get; init; } = string.Empty;
}

public sealed class RenewalImportRow
{
    public int Line { get; init; }
    public string Contract { get; init; } = string.Empty;
    public string Client { get; init; } = string.Empty;
    public string PlanDescription { get; init; } = string.Empty;
    public string SellerReference { get; init; } = string.Empty;
    public string DateText { get; init; } = string.Empty;
    public long? VendorId { get; set; }
    public string VendorName { get; set; } = string.Empty;
    public string PlanName { get; set; } = string.Empty;
    public long? PlanId { get; set; }
    public decimal Value { get; set; }
    public bool NeedsReview { get; set; }
    public bool Include { get; set; }
    public bool Duplicate { get; set; }
    public string Error { get; set; } = string.Empty;
    public string DateLabel => DateOnly.TryParseExact(DateText, "yyyy-MM-dd", out var date) ? date.ToString("dd/MM/yyyy") : DateText;
    public string ValueLabel => Value.ToString("C2", System.Globalization.CultureInfo.GetCultureInfo("pt-BR"));
}

public sealed class AdditionalProduct
{
    [JsonPropertyName("id")] public long Id { get; init; }
    [JsonPropertyName("nome")] public string Name { get; init; } = string.Empty;
    [JsonPropertyName("valor")] public decimal Value { get; init; }
    public string Label => $"{Name} · {Value.ToString("C2", System.Globalization.CultureInfo.GetCultureInfo("pt-BR"))}";
    public override string ToString() => Label;
}

public sealed class SaleRequest
{
    [JsonPropertyName("vendedor_id")] public long? VendorId { get; init; }
    [JsonPropertyName("filial_origem_id")] public long OriginBranchId { get; init; }
    [JsonPropertyName("filial_destino_id")] public long DestinationBranchId { get; init; }
    [JsonPropertyName("plano_id")] public long? PlanId { get; init; }
    [JsonPropertyName("data_venda")] public DateTimeOffset SaleDate { get; init; }
    [JsonPropertyName("valor")] public decimal Value { get; init; }
    [JsonPropertyName("numero_venda")] public string ContractNumber { get; init; } = string.Empty;
    [JsonPropertyName("observacao")] public string? Notes { get; init; }
    [JsonPropertyName("fora_filial")] public bool OutsideBranch { get; init; }
}

public sealed class AuthResponse
{
    [JsonPropertyName("access_token")] public string AccessToken { get; init; } = string.Empty;
    [JsonPropertyName("refresh_token")] public string RefreshToken { get; init; } = string.Empty;
    [JsonPropertyName("expires_in")] public int ExpiresIn { get; init; }
    [JsonPropertyName("user")] public AuthUser User { get; init; } = new();
}

public sealed class AuthUser
{
    [JsonPropertyName("id")] public Guid Id { get; init; }
    [JsonPropertyName("email")] public string Email { get; init; } = string.Empty;
}

public sealed class SupabaseError
{
    [JsonPropertyName("code")] public string? Code { get; init; }
    [JsonPropertyName("msg")] public string? Message { get; init; }
    [JsonPropertyName("message")] public string? AlternativeMessage { get; init; }
    [JsonPropertyName("error_description")] public string? Description { get; init; }
}

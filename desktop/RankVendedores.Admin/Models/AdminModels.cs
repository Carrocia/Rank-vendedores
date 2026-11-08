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
    [JsonPropertyName("vendedor_id")] public long VendorId { get; init; }
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
    [JsonPropertyName("nome")] public string Name { get; init; } = string.Empty;
    [JsonPropertyName("tipo")] public string Type { get; init; } = string.Empty;
    public string TypeLabel => Type == "interno" ? "Interno" : "Externo";
    public override string ToString() => $"{Name} · {TypeLabel}";
}

public sealed class Plan
{
    [JsonPropertyName("id")] public long Id { get; init; }
    [JsonPropertyName("nome")] public string Name { get; init; } = string.Empty;
    [JsonPropertyName("valor")] public decimal Value { get; init; }
    [JsonPropertyName("velocidade_mb")] public int? SpeedMbps { get; init; }
    [JsonPropertyName("eh_servico")] public bool IsService { get; init; }
    public string Label => $"{Name}{(!IsService && SpeedMbps is > 0 ? $" · {SpeedMbps} Mbps" : string.Empty)} · {Value.ToString("C2", System.Globalization.CultureInfo.GetCultureInfo("pt-BR"))}";
    public override string ToString() => Label;
}

public sealed class SaleRequest
{
    [JsonPropertyName("vendedor_id")] public long VendorId { get; init; }
    [JsonPropertyName("filial_origem_id")] public long OriginBranchId { get; init; }
    [JsonPropertyName("filial_destino_id")] public long DestinationBranchId { get; init; }
    [JsonPropertyName("plano_id")] public long PlanId { get; init; }
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

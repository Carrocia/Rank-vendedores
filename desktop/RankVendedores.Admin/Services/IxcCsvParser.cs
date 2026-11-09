using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace RankVendedores.Admin.Services;

public sealed record IxcCsvRow(int Line, string Contract, string BranchCode, string Status, string Client,
    string PlanDescription, string ActivationDate, string IxcVendorId, string LastUpdated, bool HasBranchColumn);

public static partial class IxcCsvParser
{
    public static IReadOnlyList<IxcCsvRow> Parse(string content)
    {
        var lines = ReadRows(content);
        if (lines.Count < 2) throw new InvalidDataException("O CSV está vazio ou não contém linhas de venda.");
        var headers = lines[0].Select(Normalize).ToList();
        int Column(string name) => headers.IndexOf(Normalize(name));
        var columns = new Dictionary<string, int>
        {
            ["contract"] = Column("ID"), ["branch"] = Column("Filial"), ["status"] = Column("Status contrato"),
            ["client"] = Column("Cliente"), ["plan"] = Column("Descrição"), ["activation"] = Column("Data ativação"),
            ["vendor"] = Column("Vendedor"), ["updated"] = Column("Última atualização"),
        };
        var missing = new List<string>();
        foreach (var name in new[] { "contract", "client", "plan", "vendor", "updated" })
            if (columns[name] < 0) missing.Add(name);
        if (columns["status"] < 0 && columns["activation"] < 0) missing.Add("Status contrato ou Data ativação");
        if (missing.Count > 0) throw new InvalidDataException($"Faltam colunas esperadas no CSV do IXC: {string.Join(", ", missing)}.");

        string Cell(string[] row, string name)
        {
            var index = columns[name];
            return index >= 0 && index < row.Length ? row[index].Trim() : string.Empty;
        }
        return lines.Skip(1).Select((row, index) => new IxcCsvRow(index + 2,
            Regex.Replace(Cell(row, "contract"), @"\s+", ""), Cell(row, "branch"),
            columns["status"] >= 0 ? Cell(row, "status") : "Ativo", Cell(row, "client"), Cell(row, "plan"),
            Cell(row, "activation"), Regex.Replace(Cell(row, "vendor"), @"\s+", ""), Cell(row, "updated"), columns["branch"] >= 0))
            .Where(row => row.Contract.Length > 0 || row.IxcVendorId.Length > 0 || row.Client.Length > 0).ToList();
    }

    public static string Normalize(string? value)
    {
        var decomposed = (value ?? string.Empty).Normalize(NormalizationForm.FormD);
        var clean = new string(decomposed.Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark).ToArray());
        return NonAlphaNumeric().Replace(clean.ToLowerInvariant(), " ").Trim();
    }

    public static IReadOnlyList<string[]> ReadRows(string input)
    {
        var text = input.TrimStart('\uFEFF');
        var firstLine = text.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? string.Empty;
        var separator = new[] { ';', ',', '\t' }.OrderByDescending(candidate => firstLine.Count(c => c == candidate)).First();
        var rows = new List<string[]>();
        var cells = new List<string>();
        var cell = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < text.Length; i++)
        {
            var ch = text[i];
            if (ch == '"')
            {
                if (quoted && i + 1 < text.Length && text[i + 1] == '"') { cell.Append('"'); i++; }
                else quoted = !quoted;
            }
            else if (ch == separator && !quoted) { cells.Add(Decode(cell.ToString())); cell.Clear(); }
            else if ((ch == '\r' || ch == '\n') && !quoted)
            {
                if (ch == '\r' && i + 1 < text.Length && text[i + 1] == '\n') i++;
                cells.Add(Decode(cell.ToString())); cell.Clear();
                if (cells.Any(value => value.Length > 0)) rows.Add(cells.ToArray());
                cells.Clear();
            }
            else cell.Append(ch);
        }
        cells.Add(Decode(cell.ToString()));
        if (cells.Any(value => value.Length > 0)) rows.Add(cells.ToArray());
        return rows;
    }

    private static string Decode(string value)
    {
        var text = value.Trim();
        var match = ExcelFormula().Match(text);
        return match.Success ? match.Groups[1].Value.Replace("\"\"", "\"").Trim() : text;
    }

    [GeneratedRegex("^=\\s*\"([\\s\\S]*)\"$")]
    private static partial Regex ExcelFormula();

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonAlphaNumeric();
}

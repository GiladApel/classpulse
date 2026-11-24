# ADR-008: Excel, CSV and Google Sheets exports behind one interface

| | |
|---|---|
| **Status** | Accepted (M3), generalised in M14 |
| **Deciders** | Gilad Apel |
| **Scope** | Attendance and comment exports |
| **Related** | [EDD-Infrastructure](../07-edd/infra.md) |

## Context
The lecturer asked for attendance and comments "in Excel", online or offline. Hebrew must survive Excel, which assumes a legacy code page for CSV.

## Decision
`SpreadsheetExporter` (Strategy) takes a `Table` and produces `.xlsx` (**SheetJS**, right-to-left sheet), `.csv` (UTF-8 with a BOM) or a tab in a **Google Sheet** (service account).

## Options considered
| Option | Hebrew in Excel | Online sheet | Dependencies |
|---|---|---|---|
| **SheetJS + CSV + Sheets API** | Yes (xlsx, BOM CSV) | Yes | xlsx, googleapis |
| CSV only | Only with a BOM | No | None |
| Google Sheets only | Yes | Yes | Needs a Google account |

## Consequences
- Any new export (comments in M14) is a new `Table`, not a new exporter.
- The Sheets export is offered only when a service account is configured.

## Evidence
`exporters.test.ts` (BOM, escaping, RTL workbook); E2E scenario 6 reads the downloaded xlsx.

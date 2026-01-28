"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Papa from "papaparse";
import {
  getClientPB,
  getCampaign,
  getCustomFields,
  getCompanies,
  createContact,
  createCompany,
  createCustomField,
  setContactFieldValue,
} from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  Upload,
  FileText,
  Check,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import type { Campaign, CustomField, Company, CSVColumn, ColumnMapping, CustomFieldType } from "@/types";

const STANDARD_FIELDS = [
  { id: "email", name: "Email", required: true },
  { id: "first_name", name: "First Name", required: false },
  { id: "last_name", name: "Last Name", required: false },
  { id: "title", name: "Title", required: false },
  { id: "company_name", name: "Company Name", required: false },
];

type ImportStep = "upload" | "mapping" | "importing" | "complete";

export default function ImportPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Import state
  const [step, setStep] = useState<ImportStep>("upload");
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [csvColumns, setCsvColumns] = useState<CSVColumn[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importResults, setImportResults] = useState({ success: 0, failed: 0, errors: [] as string[] });

  const loadData = useCallback(async () => {
    try {
      const pb = getClientPB();
      const [campaignData, fieldsData, companiesData] = await Promise.all([
        getCampaign(pb, campaignId),
        getCustomFields(pb, campaignId),
        getCompanies(pb, campaignId),
      ]);

      setCampaign(campaignData);
      setCustomFields(fieldsData);
      setCompanies(companiesData);
    } catch (error) {
      console.error("Failed to load data:", error);
      toast({
        title: "Error",
        description: "Failed to load campaign data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (results) => {
        const data = results.data as string[][];
        if (data.length < 2) {
          toast({
            title: "Invalid CSV",
            description: "The CSV file must have a header row and at least one data row.",
            variant: "destructive",
          });
          return;
        }

        const headers = data[0];
        const dataRows = data.slice(1).filter(row => row.some(cell => cell.trim()));

        setCsvData(dataRows);

        // Create column info with sample values
        const columns: CSVColumn[] = headers.map((header, index) => ({
          index,
          header: header.trim(),
          sampleValues: dataRows.slice(0, 3).map(row => row[index] || ""),
        }));

        setCsvColumns(columns);

        // Auto-map columns based on header names
        const mappings: ColumnMapping[] = columns.map((col) => {
          const headerLower = col.header.toLowerCase();
          let targetField: string | null = null;
          let isCustomField = false;

          // Try to match standard fields
          if (headerLower.includes("email")) {
            targetField = "email";
          } else if (headerLower.includes("first") && headerLower.includes("name")) {
            targetField = "first_name";
          } else if (headerLower.includes("last") && headerLower.includes("name")) {
            targetField = "last_name";
          } else if (headerLower === "name" || headerLower === "full name") {
            targetField = "first_name";
          } else if (headerLower.includes("title") || headerLower.includes("position") || headerLower.includes("role")) {
            targetField = "title";
          } else if (headerLower.includes("company") || headerLower.includes("organization")) {
            targetField = "company_name";
          }

          // Try to match custom fields
          if (!targetField) {
            const matchedField = customFields.find(
              f => f.name.toLowerCase() === headerLower
            );
            if (matchedField) {
              targetField = matchedField.id;
              isCustomField = true;
            }
          }

          return {
            csvColumn: col.header,
            targetField,
            isCustomField,
          };
        });

        setColumnMappings(mappings);
        setStep("mapping");
      },
      error: (error) => {
        console.error("CSV parse error:", error);
        toast({
          title: "Parse Error",
          description: "Failed to parse the CSV file. Please check the format.",
          variant: "destructive",
        });
      },
    });
  };

  const updateMapping = (columnIndex: number, targetField: string | null, isCustomField: boolean = false) => {
    const newMappings = [...columnMappings];
    
    if (targetField === "__new__") {
      // Handle creating new custom field
      newMappings[columnIndex] = {
        ...newMappings[columnIndex],
        targetField: null,
        isCustomField: true,
        createNewField: true,
        newFieldType: "text",
      };
    } else if (targetField === "__skip__" || targetField === null) {
      newMappings[columnIndex] = {
        ...newMappings[columnIndex],
        targetField: null,
        isCustomField: false,
        createNewField: false,
      };
    } else {
      newMappings[columnIndex] = {
        ...newMappings[columnIndex],
        targetField,
        isCustomField,
        createNewField: false,
      };
    }
    
    setColumnMappings(newMappings);
  };

  const updateNewFieldType = (columnIndex: number, fieldType: CustomFieldType) => {
    const newMappings = [...columnMappings];
    newMappings[columnIndex] = {
      ...newMappings[columnIndex],
      newFieldType: fieldType,
    };
    setColumnMappings(newMappings);
  };

  const hasEmailMapping = columnMappings.some(m => m.targetField === "email");

  const runImport = async () => {
    if (!hasEmailMapping) {
      toast({
        title: "Missing Required Field",
        description: "Please map at least the Email column.",
        variant: "destructive",
      });
      return;
    }

    setStep("importing");
    const pb = getClientPB();
    const total = csvData.length;
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    // Create any new custom fields first
    const newFieldsMap = new Map<string, string>();
    for (let i = 0; i < columnMappings.length; i++) {
      const mapping = columnMappings[i];
      if (mapping.createNewField) {
        try {
          const newField = await createCustomField(pb, {
            name: csvColumns[i].header,
            field_type: mapping.newFieldType || "text",
            options: [],
            order: customFields.length + newFieldsMap.size,
            campaign: campaignId,
          });
          newFieldsMap.set(csvColumns[i].header, newField.id);
        } catch (error) {
          console.error("Failed to create custom field:", error);
          errors.push(`Failed to create field: ${csvColumns[i].header}`);
        }
      }
    }

    // Create company lookup
    const companyMap = new Map<string, string>();
    companies.forEach(c => companyMap.set(c.name.toLowerCase(), c.id));

    // Import each row
    for (let rowIndex = 0; rowIndex < csvData.length; rowIndex++) {
      const row = csvData[rowIndex];
      setImportProgress({ current: rowIndex + 1, total });

      try {
        // Extract contact data
        const contactData: Record<string, string> = {};
        const customFieldValues: { fieldId: string; value: string }[] = [];
        let companyName = "";

        for (let colIndex = 0; colIndex < columnMappings.length; colIndex++) {
          const mapping = columnMappings[colIndex];
          const value = row[colIndex]?.trim() || "";

          if (!mapping.targetField && !mapping.createNewField) continue;

          if (mapping.targetField === "company_name") {
            companyName = value;
          } else if (mapping.createNewField) {
            const fieldId = newFieldsMap.get(csvColumns[colIndex].header);
            if (fieldId) {
              customFieldValues.push({ fieldId, value });
            }
          } else if (mapping.isCustomField && mapping.targetField) {
            customFieldValues.push({ fieldId: mapping.targetField, value });
          } else if (mapping.targetField) {
            contactData[mapping.targetField] = value;
          }
        }

        // Skip if no email
        if (!contactData.email) {
          failed++;
          errors.push(`Row ${rowIndex + 2}: Missing email`);
          continue;
        }

        // Create or find company
        let companyId = "";
        if (companyName) {
          const existingCompanyId = companyMap.get(companyName.toLowerCase());
          if (existingCompanyId) {
            companyId = existingCompanyId;
          } else {
            try {
              const newCompany = await createCompany(pb, {
                name: companyName,
                website: "",
                industry: "",
                campaign: campaignId,
              });
              companyId = newCompany.id;
              companyMap.set(companyName.toLowerCase(), newCompany.id);
            } catch (e) {
              console.error("Failed to create company:", e);
            }
          }
        }

        // Create contact
        const contact = await createContact(pb, {
          email: contactData.email,
          first_name: contactData.first_name || "",
          last_name: contactData.last_name || "",
          title: contactData.title || "",
          company: companyId,
          campaign: campaignId,
        });

        // Set custom field values
        for (const { fieldId, value } of customFieldValues) {
          if (value) {
            try {
              await setContactFieldValue(pb, {
                contact: contact.id,
                custom_field: fieldId,
                value,
              });
            } catch (e) {
              console.error("Failed to set field value:", e);
            }
          }
        }

        success++;
      } catch (error: any) {
        failed++;
        const errorMsg = error?.data?.data?.email?.message || error?.message || "Unknown error";
        errors.push(`Row ${rowIndex + 2}: ${errorMsg}`);
      }
    }

    setImportResults({ success, failed, errors: errors.slice(0, 10) });
    setStep("complete");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Campaign not found</h2>
        <Button asChild className="mt-4">
          <Link href="/campaigns">Back to Campaigns</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/campaigns/${campaignId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Import Contacts</h1>
          <p className="text-muted-foreground">{campaign.name}</p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2">
        {["upload", "mapping", "importing", "complete"].map((s, i) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s
                  ? "bg-primary text-primary-foreground"
                  : ["upload", "mapping", "importing", "complete"].indexOf(step) > i
                  ? "bg-green-500 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {["upload", "mapping", "importing", "complete"].indexOf(step) > i ? (
                <Check className="h-4 w-4" />
              ) : (
                i + 1
              )}
            </div>
            {i < 3 && (
              <div
                className={`w-12 h-0.5 ${
                  ["upload", "mapping", "importing", "complete"].indexOf(step) > i
                    ? "bg-green-500"
                    : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Upload Step */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload CSV File</CardTitle>
            <CardDescription>
              Select a CSV file to import contacts. The first row should contain column headers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <Label
                htmlFor="csv-upload"
                className="cursor-pointer text-primary hover:underline"
              >
                Click to select a CSV file
              </Label>
              <Input
                id="csv-upload"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileUpload}
              />
              <p className="text-sm text-muted-foreground mt-2">
                Supported format: .csv
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mapping Step */}
      {step === "mapping" && (
        <Card>
          <CardHeader>
            <CardTitle>Map Columns</CardTitle>
            <CardDescription>
              Match your CSV columns to contact fields. Email is required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Preview */}
            <div>
              <h4 className="font-medium mb-2">Preview ({csvData.length} rows)</h4>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {csvColumns.map((col) => (
                        <TableHead key={col.index} className="whitespace-nowrap">
                          {col.header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvData.slice(0, 3).map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <TableCell key={cellIndex} className="whitespace-nowrap">
                            {cell || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Column Mappings */}
            <div>
              <h4 className="font-medium mb-2">Column Mapping</h4>
              <div className="space-y-3">
                {csvColumns.map((col, index) => (
                  <div
                    key={col.index}
                    className="flex items-center gap-4 p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{col.header}</p>
                      <p className="text-sm text-muted-foreground">
                        Sample: {col.sampleValues[0] || "(empty)"}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 flex gap-2">
                      <Select
                        value={
                          columnMappings[index]?.createNewField
                            ? "__new__"
                            : columnMappings[index]?.targetField || "__skip__"
                        }
                        onValueChange={(value) => {
                          if (value === "__new__") {
                            updateMapping(index, "__new__", true);
                          } else if (value === "__skip__") {
                            updateMapping(index, null);
                          } else {
                            const isCustom = customFields.some(f => f.id === value);
                            updateMapping(index, value, isCustom);
                          }
                        }}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Select field..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__skip__">Skip this column</SelectItem>
                          {STANDARD_FIELDS.map((field) => (
                            <SelectItem key={field.id} value={field.id}>
                              {field.name}
                              {field.required && " *"}
                            </SelectItem>
                          ))}
                          {customFields.length > 0 && (
                            <>
                              <SelectItem value="__divider__" disabled>
                                ── Custom Fields ──
                              </SelectItem>
                              {customFields.map((field) => (
                                <SelectItem key={field.id} value={field.id}>
                                  {field.name}
                                </SelectItem>
                              ))}
                            </>
                          )}
                          <SelectItem value="__new__">+ Create new field</SelectItem>
                        </SelectContent>
                      </Select>

                      {columnMappings[index]?.createNewField && (
                        <Select
                          value={columnMappings[index]?.newFieldType || "text"}
                          onValueChange={(value) => updateNewFieldType(index, value as CustomFieldType)}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="boolean">Yes/No</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    {columnMappings[index]?.targetField === "email" && (
                      <Badge variant="success">Required</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {!hasEmailMapping && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-800 dark:text-yellow-200">
                <AlertCircle className="h-4 w-4" />
                <p className="text-sm">Please map the Email column to proceed.</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button onClick={runImport} disabled={!hasEmailMapping}>
                Import {csvData.length} Contacts
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Importing Step */}
      {step === "importing" && (
        <Card>
          <CardHeader>
            <CardTitle>Importing Contacts...</CardTitle>
            <CardDescription>
              Please wait while we import your contacts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress
              value={(importProgress.current / importProgress.total) * 100}
            />
            <p className="text-center text-muted-foreground">
              {importProgress.current} of {importProgress.total} contacts processed
            </p>
          </CardContent>
        </Card>
      )}

      {/* Complete Step */}
      {step === "complete" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              Import Complete
            </CardTitle>
            <CardDescription>
              Your contacts have been imported.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {importResults.success}
                </p>
                <p className="text-sm text-green-700 dark:text-green-300">
                  Successfully imported
                </p>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {importResults.failed}
                </p>
                <p className="text-sm text-red-700 dark:text-red-300">
                  Failed to import
                </p>
              </div>
            </div>

            {importResults.errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Errors:</h4>
                <div className="text-sm space-y-1 text-muted-foreground max-h-40 overflow-y-auto">
                  {importResults.errors.map((error, i) => (
                    <p key={i}>{error}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setStep("upload");
                setCsvData([]);
                setCsvColumns([]);
                setColumnMappings([]);
              }}>
                Import More
              </Button>
              <Button asChild>
                <Link href={`/campaigns/${campaignId}`}>
                  View Contacts
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** 与后端 Pydantic schema 对应的核心类型（手写镜像；可由 gen:api 生成的类型替换）。 */

export type Role = "SUPER_ADMIN" | "OPERATOR" | "ANNOTATOR" | "DOCTOR";

export interface LoginResponse {
  access_token: string;
  token_type: string;
  role: Role;
  user_id: number;
  clinic_id: number | null;
  display_name: string | null;
}

export interface MeResponse {
  user_id: number;
  role: Role;
  clinic_id: number | null;
  display_name: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface AiUsageMonthlyItem {
  usage_month: string;
  clinic_id: number | null;
  clinic_name: string | null;
  model: string;
  purpose: string;
  call_count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: string;
}

export interface AiUsageSummary {
  call_count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: string;
}

export interface AiUsageMonthlyResponse {
  summary: AiUsageSummary;
  items: AiUsageMonthlyItem[];
}

export interface Clinic {
  id: number;
  clinic_code: string;
  clinic_name: string;
  clinic_name_en: string | null;
  address: string | null;
  phone: string | null;
  chop_image_url: string | null;
  status: number;
  created_at: string;
}

export interface TemplateConfigItem {
  template_id: number;
  template_name: string;
  version: string;
  parse_status: ParseStatus;
  is_active: boolean;
  enabled: boolean;
  updated_at: string | null;
}

export interface CompanyConfigItem {
  company_id: number;
  company_name: string;
  enabled: boolean;
  template_count: number;
  enabled_template_count: number;
  templates: TemplateConfigItem[];
}

export interface ClinicConfigOverview {
  companies: CompanyConfigItem[];
}

export interface Doctor {
  id: number;
  clinic_id: number;
  doctor_name: string;
  doctor_name_en: string | null;
  reg_no: string | null;
  signature_url: string | null;
  login_account: string;
  status: number;
  created_at: string;
}

export interface InsuranceCompany {
  id: number;
  company_code: string;
  company_name: string;
  company_name_en: string | null;
  logo_url: string | null;
  contact_info: string | null;
  status: number;
  created_at: string;
}

export interface StandardField {
  id: number;
  field_code: string;
  field_name: string;
  field_name_en: string | null;
  domain_id: number;
  data_type: string;
  enum_options: string[] | null;
  is_required: boolean;
  source_type: string;
  ai_extraction_hint: string | null;
  validation_rule: string | null;
  example_value: string | null;
  is_active: boolean;
  created_at: string;
}

export interface FieldDomain {
  id: number;
  domain_code: string;
  domain_name: string;
  sort_order: number;
  remark: string | null;
}

export type ParseStatus =
  | "PENDING"
  | "PARSING"
  | "AUTO_PARSED"
  | "AI_ASSISTED"
  | "ANNOTATED"
  | "PUBLISHED"
  | "PARSE_FAILED";

export interface ParseProgress {
  percent: number;
  message: string | null;
  status: ParseStatus | null;
}

export interface PolicyTemplate {
  id: number;
  company_id: number;
  template_name: string;
  template_code: string;
  version: string;
  original_pdf_url: string;
  page_count: number;
  page_width: number | null;
  page_height: number | null;
  parse_status: ParseStatus;
  parse_progress: number;
  parse_message: string | null;
  parse_error: string | null;
  is_active: boolean;
  created_at: string;
}

export interface FieldMapping {
  id: number;
  standard_field_id: number | null;
  transform_rule_id: number | null;
  fixed_value: string | null;
  checkbox_map_value: string | null;
  template_specific_field_code: string | null;
  template_specific_ai_hint: string | null;
}

export interface TemplateField {
  id: number;
  template_id: number;
  page_no: number;
  field_label_raw: string | null;
  pdf_field_name: string | null;
  field_type: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  font_size: number;
  recognize_source: string;
  confidence_score: number | null;
  is_confirmed: boolean;
  field_status: "PENDING" | "MAPPED" | "IGNORED";
  ignore_reason: string | null;
  row_version: number;
  mapping: FieldMapping | null;
}

export interface PublishPreview {
  total_count: number;
  processed_count: number;
  pending_count: number;
  missing_required: { field_code: string; field_name: string }[];
}

export type ClaimStatus =
  | "DRAFT"
  | "AI_FILLED"
  | "CONFIRMED"
  | "PRINTED"
  | "CANCELLED";

export interface Claim {
  id: number;
  submission_no: string;
  clinic_id: number;
  doctor_id: number;
  company_id: number;
  template_id: number;
  template_version: string | null;
  patient_name: string | null;
  extraction_task_id: number | null;
  extraction_task_no: string | null;
  ai_raw_result: Record<string, { value: string | null; confidence: number }> | null;
  final_field_values: Record<string, string | null> | null;
  ai_token_usage: number | null;
  ai_process_time_ms: number | null;
  generated_pdf_url: string | null;
  status: ClaimStatus;
  created_at: string;
  updated_at: string;
}

export interface ClaimListItem {
  id: number;
  submission_no: string;
  patient_name: string | null;
  company_id: number;
  template_id: number;
  generated_pdf_url: string | null;
  status: ClaimStatus;
  created_at: string;
}

export interface CompanyBrief {
  id: number;
  company_name: string;
  company_name_en: string | null;
  logo_url: string | null;
}

export interface TemplateBrief {
  id: number;
  template_name: string;
  version: string;
  page_count: number;
}

export interface ExtractedField {
  value: string | null;
  confidence: number;
}

export interface ExtractResponse {
  extracted_fields: Record<string, ExtractedField>;
  process_time_ms: number;
  token_usage: number;
}

export interface HomeStats {
  today_count: number;
  pending_draft_count: number;
  month_total_count: number;
}

export interface UnfinishedDraft {
  submission_id: number;
  patient_name: string | null;
  company_name: string;
  template_name: string;
  status: ClaimStatus;
  status_label: string;
  updated_at: string;
}

export interface QuickStartShortcut {
  company_id: number;
  company_name: string;
  template_id: number;
  template_name: string;
}

export interface RecentClaimItem {
  submission_id: number;
  patient_name: string | null;
  company_name: string;
  status: ClaimStatus;
  status_label: string;
  created_at: string;
}

export interface HomeOverview {
  greeting_name: string;
  clinic_name: string;
  stats: HomeStats;
  unfinished_drafts: UnfinishedDraft[];
  quick_start_shortcuts: QuickStartShortcut[];
  recent_claims: RecentClaimItem[];
}

/** PDF 提取流水线 Step1 响应 */
export interface Step1UploadOutput {
  task_id: string;
  status: "WAITING";
  clinic_id: number;
  doctor_id: number;
  patient_name: string | null;
  original_filename: string;
  pdf_url: string;
  file_size_bytes: number;
  created_at: string;
}

export type ExtractionTaskStatus =
  | "WAITING"
  | "PREPROCESSING"
  | "OCR"
  | "CLASSIFYING"
  | "VISIT_SELECT"
  | "EXTRACTING"
  | "VALIDATING"
  | "MAPPING"
  | "REVIEW"
  | "COMPLETED"
  | "FAILED";

export interface ExtractionTask {
  id: number;
  task_id: string;
  status: ExtractionTaskStatus;
  clinic_id: number;
  doctor_id: number;
  patient_name: string | null;
  original_filename: string;
  pdf_url: string;
  file_size_bytes: number;
  current_step: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type PageSource = "text_layer" | "ocr_required";

export interface Step2PageOutput {
  task_id: string;
  page: number;
  source: PageSource;
  text: string | null;
  image_path: string | null;
}

export interface Step2PreprocessOutput {
  task_id: string;
  status: "OCR";
  page_count: number;
  text_layer_count: number;
  ocr_required_count: number;
  pages: Step2PageOutput[];
}

export interface DocumentPage {
  id: number;
  page: number;
  source: PageSource;
  text: string | null;
  image_path: string | null;
  created_at: string;
}

export interface OcrBlock {
  text: string;
  bbox: number[] | null;
  confidence: number;
}

export interface Step3PageOcrOutput {
  task_id: string;
  page: number;
  blocks: OcrBlock[];
}

export interface Step3OcrOutput {
  task_id: string;
  status: "CLASSIFYING";
  page_count: number;
  ocr_page_count: number;
  text_layer_page_count: number;
  total_blocks: number;
  pages: Step3PageOcrOutput[];
}

export interface OcrResult {
  id: number;
  page: number;
  blocks: OcrBlock[];
  created_at: string;
}

export interface DocumentClassification {
  document_type: string;
  language: string;
  multiple_patient: boolean;
  multiple_visit: boolean;
  insurance_company: string | null;
  need_visit_selector: boolean;
  source_text_chars: number;
  source_pages_used: number;
  model_name: string | null;
  token_usage: number;
  stub: boolean;
  created_at: string;
}

export interface Step4ClassifyOutput {
  task_id: string;
  status: "VISIT_SELECT" | "EXTRACTING";
  classification: DocumentClassification;
  source_text_preview: string;
}

export interface VisitCandidate {
  id: number;
  visit_index: number;
  visit_date: string | null;
  summary: string | null;
  page_range: [number, number];
  selected: boolean;
  model_name: string | null;
  token_usage: number;
  stub: boolean;
  created_at: string;
}

export interface Step5DetectVisitsOutput {
  task_id: string;
  status: "VISIT_SELECT";
  visits: VisitCandidate[];
  source_text_preview: string;
}

export interface Step5SelectVisitOutput {
  task_id: string;
  status: "EXTRACTING";
  selected_visit: VisitCandidate;
}

export type FieldExtractionStatus = "extracted" | "missing" | "low_confidence";

export interface ExtractedFieldValue {
  value: string | null;
  status: FieldExtractionStatus;
  confidence: number;
}

export interface ExtractionPrompt {
  prompt_text: string;
  field_codes: string[];
  selected_visit_index: number | null;
  source_text_chars: number;
  source_pages_used: number;
  created_at: string;
}

export interface Step6BuildPromptOutput {
  task_id: string;
  status: "EXTRACTING";
  prompt: ExtractionPrompt;
  prompt_preview: string;
}

export interface ExtractionResult {
  fields: Record<string, ExtractedFieldValue>;
  model_name: string | null;
  token_usage: number;
  stub: boolean;
  stage: string;
  created_at: string;
}

export interface Step7ExtractFieldsOutput {
  task_id: string;
  status: "VALIDATING";
  result: ExtractionResult;
}

export interface Step8ValidateOutput {
  task_id: string;
  status: "VALIDATING";
  result: ExtractionResult;
}

export interface Step9DetectMissingOutput {
  task_id: string;
  status: "MAPPING";
  result: ExtractionResult;
}

export interface MappedFieldValue {
  value: string | null;
  status: FieldExtractionStatus;
  confidence: number;
  validation_error?: string | null;
  source_field: string;
}

export interface ExtractionMappedResult {
  insurance_company: string;
  template_id: number | null;
  mapping_source: string;
  fields: Record<string, MappedFieldValue>;
  unmapped_fields: string[];
  created_at: string;
}

export interface Step10MapOutput {
  task_id: string;
  status: "REVIEW";
  result: ExtractionMappedResult;
}

export interface FinalizeExtractionOutput {
  task_id: string;
  status: "REVIEW";
  extraction_result: ExtractionResult;
  mapped_result: ExtractionMappedResult;
}

export interface ReviewFieldValue {
  value: string | null;
  status: FieldExtractionStatus;
  confidence: number;
  validation_error?: string | null;
  page?: number | null;
  bbox?: number[] | null;
  source_text?: string | null;
}

export interface ExtractionReviewOutput {
  task_id: string;
  insurance_company: string | null;
  standard_fields: Record<string, ReviewFieldValue>;
  mapped_fields: Record<string, MappedFieldValue> | null;
  display_fields: Record<string, ReviewFieldValue>;
  /** 当前模板映射的「模板专属 AI 提取」字段 code 列表 */
  template_specific_field_codes?: string[];
  /** 非标准字段的展示名（如模板专属字段） */
  field_labels?: Record<string, string> | null;
  is_confirmed: boolean;
  reviewed_at: string | null;
  created_at: string;
}

export interface Step11PrepareReviewOutput {
  task_id: string;
  status: "REVIEW";
  review: ExtractionReviewOutput;
}

export interface Step11SaveReviewOutput {
  task_id: string;
  status: "REVIEW";
  review: ExtractionReviewOutput;
}

export interface Step11ConfirmReviewOutput {
  task_id: string;
  status: "COMPLETED";
  review: ExtractionReviewOutput;
}

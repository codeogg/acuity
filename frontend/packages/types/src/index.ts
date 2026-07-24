// Public type surface for the Acuity frontend.
//
// Generated types (from openapi.json, the canonical contract) are the source
// of truth for request/response shapes; this module re-exports the generated
// `paths` + `components` and layers ergonomic aliases plus the few
// hand-authored helpers the OpenAPI schema does not model as first-class
// (a generic page shape, the lenient runtime error envelope).
//
// snake_case field names are preserved verbatim to match the backend contract.
// Developer-readable reference: docs/api/ (generated from openapi.json).

import type { components, paths } from "./generated/openapi";

export type { components, paths };

// --- schema aliases (components.schemas.X -> X) ---------------------------
type Schemas = components["schemas"];

// Auth
export type LoginRequest = Schemas["LoginRequest"];
export type LoginResponse = Schemas["LoginResponse"];
export type MeResponse = Schemas["MeResponse"];
export type ProfileUpdateRequest = Schemas["ProfileUpdateRequest"];

// Clinics
export type ClinicCreate = Schemas["ClinicCreate"];
export type ClinicUpdate = Schemas["ClinicUpdate"];
export type ClinicStatusUpdate = Schemas["ClinicStatusUpdate"];
export type ClinicFlagUpdate = Schemas["ClinicFlagUpdate"];
export type ClinicInsuranceUpdate = Schemas["ClinicInsuranceUpdate"];
export type ClinicSubscriptionOut = Schemas["ClinicSubscriptionOut"];
export type ClinicSubscriptionUpdate = Schemas["ClinicSubscriptionUpdate"];
export type ClinicSubscriptionNoteUpdate = Schemas["ClinicSubscriptionNoteUpdate"];
export type ClinicRetentionOut = Schemas["ClinicRetentionOut"];
export type ClinicRetentionOverrideRequest = Schemas["ClinicRetentionOverrideRequest"];
export type ClinicRetentionAuditOut = Schemas["ClinicRetentionAuditOut"];
export type AccountNotesUpdate = Schemas["AccountNotesUpdate"];
export type AuditLogOut = Schemas["AuditLogOut"];
export type AuditLogCreate = Schemas["AuditLogCreate"];
export type AuditActionType = Schemas["AuditActionType"];
export type ClinicOut = Schemas["ClinicOut"];
export type ClinicConfigOverview = Schemas["ClinicConfigOverview"];
export type CompanyConfigItem = Schemas["CompanyConfigItem"];
export type TemplateConfigItem = Schemas["TemplateConfigItem"];
export type CompanyEnableUpdate = Schemas["CompanyEnableUpdate"];
export type CompanyEnableResult = Schemas["CompanyEnableResult"];
export type TemplateEnableUpdate = Schemas["TemplateEnableUpdate"];
export type TemplateEnableResult = Schemas["TemplateEnableResult"];
export type ClinicTemplatesSet = Schemas["ClinicTemplatesSet"];
export type ClinicTemplatesSetResult = Schemas["ClinicTemplatesSetResult"];

// Doctors
export type DoctorCreate = Schemas["DoctorCreate"];
export type DoctorUpdate = Schemas["DoctorUpdate"];
export type DoctorStatusUpdate = Schemas["DoctorStatusUpdate"];
export type DoctorOut = Schemas["DoctorOut"];
export type ResetPasswordResponse = Schemas["ResetPasswordResponse"];

// Insurance companies
export type CompanyCreate = Schemas["CompanyCreate"];
export type CompanyUpdate = Schemas["CompanyUpdate"];
export type CompanyStatusUpdate = Schemas["CompanyStatusUpdate"];
export type CompanyOut = Schemas["CompanyOut"];
export type CompanyBrief = Schemas["CompanyBrief"];
export type LogoUploadResponse = Schemas["LogoUploadResponse"];

// Standard fields / domains / transform rules
export type DomainCreate = Schemas["DomainCreate"];
export type DomainOut = Schemas["DomainOut"];
export type StandardFieldCreate = Schemas["StandardFieldCreate"];
export type StandardFieldUpdate = Schemas["StandardFieldUpdate"];
export type StandardFieldOut = Schemas["StandardFieldOut"];
export type TransformRuleCreate = Schemas["TransformRuleCreate"];
export type TransformRuleOut = Schemas["TransformRuleOut"];

// Templates + template fields
export type TemplateUpdate = Schemas["TemplateUpdate"];
export type TemplateOut = Schemas["TemplateOut"];
export type TemplateBrief = Schemas["TemplateBrief"];
export type TemplateUploadResponse = Schemas["TemplateUploadResponse"];
export type TemplateFileReplaceResponse = Schemas["TemplateFileReplaceResponse"];
export type ParseProgressOut = Schemas["ParseProgressOut"];
export type ReparseResponse = Schemas["ReparseResponse"];
export type TemplateFieldCreate = Schemas["TemplateFieldCreate"];
export type TemplateFieldUpdate = Schemas["TemplateFieldUpdate"];
export type TemplateFieldOut = Schemas["TemplateFieldOut"];
export type FieldMappingSave = Schemas["FieldMappingSave"];
export type FieldMappingSaveResult = Schemas["FieldMappingSaveResult"];
export type FieldMappingOut = Schemas["FieldMappingOut"];
export type FieldIgnoreSave = Schemas["FieldIgnoreSave"];
export type FieldRestoreSave = Schemas["FieldRestoreSave"];
export type PublishPreviewOut = Schemas["PublishPreviewOut"];
export type MissingRequiredFieldOut = Schemas["MissingRequiredFieldOut"];
export type PreviewFillRequest = Schemas["PreviewFillRequest"];
export type PreviewFillResponse = Schemas["PreviewFillResponse"];

// Claims (doctor filing)
export type ClaimCreate = Schemas["ClaimCreate"];
export type ClaimOut = Schemas["ClaimOut"];
export type ClaimListItem = Schemas["ClaimListItem"];
export type DraftSave = Schemas["DraftSave"];
export type DraftSaveResponse = Schemas["DraftSaveResponse"];
export type MedicalRecordSubmit = Schemas["MedicalRecordSubmit"];
export type FieldsUpdate = Schemas["FieldsUpdate"];
export type GeneratePdfResponse = Schemas["GeneratePdfResponse"];
export type ReuseRequest = Schemas["ReuseRequest"];
export type ReuseResponse = Schemas["ReuseResponse"];
export type HomeOverview = Schemas["HomeOverview"];
export type HomeStats = Schemas["HomeStats"];
export type UnfinishedDraft = Schemas["UnfinishedDraft"];
export type QuickStartShortcut = Schemas["QuickStartShortcut"];
export type RecentClaimItem = Schemas["RecentClaimItem"];

// AI extraction
export type ExtractRequest = Schemas["ExtractRequest"];
export type ExtractResponse = Schemas["ExtractResponse"];
export type ExtractedField = Schemas["ExtractedField"];

// Validation error (native FastAPI 422 shape)
export type HTTPValidationError = Schemas["HTTPValidationError"];
export type ValidationError = Schemas["ValidationError"];

// Shared acknowledgement + error envelope
export type SuccessResponse = Schemas["SuccessResponse"];
export type ErrorEnvelope = Schemas["ErrorEnvelope"];

// Contract enums (closed lists declared in openapi.json)
export type ClaimStatus = Schemas["ClaimStatus"];
export type TemplateParseStatus = Schemas["TemplateParseStatus"];
export type TemplateFieldStatus = Schemas["TemplateFieldStatus"];
export type TemplateFieldType = Schemas["TemplateFieldType"];
export type RecognizeSource = Schemas["RecognizeSource"];
export type FieldDataType = Schemas["FieldDataType"];
export type FieldSourceType = Schemas["FieldSourceType"];
export type TransformRuleType = Schemas["TransformRuleType"];
export type UserRole = Schemas["UserRole"];
export type ApiErrorCode = Schemas["ErrorCode"];

// --- frontend-only forward contract (x-backend-status ops) ----------------

// Account management (ADR 0041)
export type WorkspaceSeparation = Schemas["WorkspaceSeparation"];
export type DoctorAccountOut = Schemas["DoctorAccountOut"];
export type ClinicAccountOut = Schemas["ClinicAccountOut"];
export type DoctorClinicLink = Schemas["DoctorClinicLink"];
export type DoctorClinicsSet = Schemas["DoctorClinicsSet"];
export type DoctorAccountModelUpdate = Schemas["DoctorAccountModelUpdate"];
export type ClinicNotesUpdate = Schemas["ClinicNotesUpdate"];

// Auth flow (ADRs 0040/0041 target journey)
export type MfaMethod = Schemas["MfaMethod"];
export type MfaChallenge = Schemas["MfaChallenge"];
export type MfaVerifyRequest = Schemas["MfaVerifyRequest"];
export type RecoveryStartRequest = Schemas["RecoveryStartRequest"];
export type AuthClinicOption = Schemas["AuthClinicOption"];
export type AuthClinicList = Schemas["AuthClinicList"];
export type ClinicSelectRequest = Schemas["ClinicSelectRequest"];
export type ClinicSelectResponse = Schemas["ClinicSelectResponse"];
export type SessionState = Schemas["SessionState"];
export type DeepLinkTokenRequest = Schemas["DeepLinkTokenRequest"];
export type DeepLinkToken = Schemas["DeepLinkToken"];
export type DeepLinkRedeemRequest = Schemas["DeepLinkRedeemRequest"];
export type DeepLinkRedeemResponse = Schemas["DeepLinkRedeemResponse"];

// Claim extensions
export type ClaimIntakeText = Schemas["ClaimIntakeText"];

// Document inbox
export type InboxDocumentStatus = Schemas["InboxDocumentStatus"];
export type InboxDocument = Schemas["InboxDocument"];
export type InboxImportResult = Schemas["InboxImportResult"];

// Staff hand-off
export type HandoffStatus = Schemas["HandoffStatus"];
export type StaffHandoff = Schemas["StaffHandoff"];
export type HandoffCreate = Schemas["HandoffCreate"];

// Doctor settings
export type DeliveryDefault = Schemas["DeliveryDefault"];
export type TrustedDevice = Schemas["TrustedDevice"];
export type DoctorSettings = Schemas["DoctorSettings"];
export type DoctorSettingsUpdate = Schemas["DoctorSettingsUpdate"];

// Notifications
export type NotificationKind = Schemas["NotificationKind"];
export type NotificationItem = Schemas["NotificationItem"];

// Support access + impersonation
export type ImpersonationMode = Schemas["ImpersonationMode"];
export type SupportAccessGrant = Schemas["SupportAccessGrant"];
export type SupportAccessState = Schemas["SupportAccessState"];
export type SupportAccessGrantRequest = Schemas["SupportAccessGrantRequest"];
export type SupportAccessRevokeRequest = Schemas["SupportAccessRevokeRequest"];
export type ImpersonationSession = Schemas["ImpersonationSession"];
export type ImpersonationSessionState = Schemas["ImpersonationSessionState"];
export type ImpersonationStartRequest = Schemas["ImpersonationStartRequest"];

// Coverage registry
export type CoverageStatus = Schemas["CoverageStatus"];
export type CoverageForm = Schemas["CoverageForm"];
export type CoverageInsurer = Schemas["CoverageInsurer"];

// Admin audit
export type AuditActionClass = Schemas["AuditActionClass"];
export type AuditEvent = Schemas["AuditEvent"];
export type AuditEventCreate = Schemas["AuditEventCreate"];

// Admin tickets + onboarding queue
export type TicketStatus = Schemas["TicketStatus"];
export type Ticket = Schemas["Ticket"];
export type TicketUpdate = Schemas["TicketUpdate"];
export type TicketResolveRequest = Schemas["TicketResolveRequest"];
export type OnboardingQueueItem = Schemas["OnboardingQueueItem"];

// Admin tags
export type TagKind = Schemas["TagKind"];
export type Tag = Schemas["Tag"];
export type TagCreate = Schemas["TagCreate"];
export type TagUpdate = Schemas["TagUpdate"];
export type TagRetireRequest = Schemas["TagRetireRequest"];
export type TagRetireResult = Schemas["TagRetireResult"];
export type TagVisibilityEntry = Schemas["TagVisibilityEntry"];
export type TagVisibilitySet = Schemas["TagVisibilitySet"];

// Admin analytics
export type AnalyticsOverview = Schemas["AnalyticsOverview"];
export type UsagePoint = Schemas["UsagePoint"];
export type ActivationFunnel = Schemas["ActivationFunnel"];
export type VerificationReport = Schemas["VerificationReport"];
export type QualityTrendPoint = Schemas["QualityTrendPoint"];
export type QualityReport = Schemas["QualityReport"];
export type AnalyticsExportRequest = Schemas["AnalyticsExportRequest"];
export type AnalyticsExportResult = Schemas["AnalyticsExportResult"];

// --- hand-authored contract helpers ----------------------------------------

// Generic offset-pagination envelope. The contract declares concrete
// `Page_ClaimListItem_` etc.; this generic mirrors that shape for the api-client.
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// Lenient runtime form of the domain-error envelope: servers may emit codes
// beyond the closed ErrorCode enum during rollout, so the client-side type
// keeps `string` in the union. The strict contract shape is ErrorEnvelope.
export interface ApiErrorEnvelope {
  error: {
    code: ApiErrorCode | string;
    message: string;
    request_id?: string;
  };
}

// enabled/disabled numeric status used across clinic/doctor/company entities.
export const ENTITY_STATUS_DISABLED = 0 as const;
export const ENTITY_STATUS_ENABLED = 1 as const;

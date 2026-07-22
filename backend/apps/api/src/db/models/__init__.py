"""集中导入全部模型，供 Alembic autogenerate 与 ORM 使用。"""
from src.db.models.admin import AdminUser, OperationLog
from src.db.models.ai_usage import AiModelPricing, AiUsageLog
from src.db.models.claims import ClaimFieldChangeLog, ClaimSubmission
from src.db.models.extraction import (
    DocumentClassification,
    DocumentPage,
    ExtractionMappedResult,
    ExtractionPrompt,
    ExtractionResult,
    ExtractionReviewOutput,
    ExtractionTask,
    ExtractionVisit,
    OcrResult,
)
from src.db.models.districts import District
from src.db.models.org import (
    Clinic,
    ClinicInsuranceCompany,
    Doctor,
    DoctorClinicLink,
    InsuranceCompany,
)
from src.db.models.standard_fields import (
    FieldDomain,
    FieldTransformRule,
    StandardField,
)
from src.db.models.subscriptions import ClinicSubscription
from src.db.models.tags import FormTag, TagVisibility
from src.db.models.templates import (
    ClinicPolicyTemplate,
    PolicyTemplate,
    TemplateField,
    TemplateFieldMapping,
)

__all__ = [
    "AdminUser",
    "OperationLog",
    "AiUsageLog",
    "AiModelPricing",
    "ClaimSubmission",
    "ClaimFieldChangeLog",
    "ExtractionTask",
    "DocumentPage",
    "OcrResult",
    "DocumentClassification",
    "ExtractionVisit",
    "ExtractionPrompt",
    "ExtractionResult",
    "ExtractionMappedResult",
    "ExtractionReviewOutput",
    "Clinic",
    "Doctor",
    "DoctorClinicLink",
    "InsuranceCompany",
    "ClinicInsuranceCompany",
    "District",
    "ClinicSubscription",
    "FieldDomain",
    "StandardField",
    "FieldTransformRule",
    "PolicyTemplate",
    "ClinicPolicyTemplate",
    "TemplateField",
    "TemplateFieldMapping",
    "FormTag",
    "TagVisibility",
]

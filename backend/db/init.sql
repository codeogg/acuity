-- ============================================================
-- 香港诊所保险保单智能填报 SaaS 系统 —— PostgreSQL 16 初始化 DDL
-- 与《最终版-模块与功能规格说明》第一章保持一致
-- ============================================================

-- 1.1 通用触发器（自动更新 updated_at）
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1.2 标准字段库
-- ============================================================
CREATE TABLE IF NOT EXISTS field_domain (
    id              BIGSERIAL PRIMARY KEY,
    domain_code     VARCHAR(50)  NOT NULL UNIQUE,
    domain_name     VARCHAR(100) NOT NULL,
    sort_order      INT DEFAULT 0,
    remark          VARCHAR(255),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE field_domain IS '标准字段-信息域分类表';
DROP TRIGGER IF EXISTS set_updated_at ON field_domain;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON field_domain
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS standard_field (
    id                  BIGSERIAL PRIMARY KEY,
    field_code          VARCHAR(100) NOT NULL UNIQUE,
    field_name          VARCHAR(100) NOT NULL,
    field_name_en       VARCHAR(100),
    domain_id           BIGINT NOT NULL REFERENCES field_domain(id),
    data_type           VARCHAR(20) NOT NULL,
    enum_options        JSONB,
    is_required         BOOLEAN DEFAULT FALSE,
    source_type         VARCHAR(20) NOT NULL DEFAULT 'AI',
    ai_extraction_hint  TEXT,
    validation_rule     VARCHAR(255),
    example_value       VARCHAR(255),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE standard_field IS '标准字段定义表（字段字典核心表）';
CREATE INDEX IF NOT EXISTS idx_standard_field_domain ON standard_field(domain_id);
DROP TRIGGER IF EXISTS set_updated_at ON standard_field;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON standard_field
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS field_transform_rule (
    id              BIGSERIAL PRIMARY KEY,
    rule_code       VARCHAR(50) NOT NULL UNIQUE,
    rule_name       VARCHAR(100) NOT NULL,
    rule_type       VARCHAR(30) NOT NULL,
    rule_config     JSONB,
    remark          VARCHAR(255),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE field_transform_rule IS '字段格式转换规则表';

-- ============================================================
-- 1.3 诊所 / 保险公司 / 医生
-- ============================================================
CREATE TABLE IF NOT EXISTS clinic (
    id              BIGSERIAL PRIMARY KEY,
    clinic_code     VARCHAR(50) NOT NULL UNIQUE,
    clinic_name     VARCHAR(200) NOT NULL,
    clinic_name_en  VARCHAR(200),
    address         VARCHAR(255),
    phone           VARCHAR(50),
    chop_image_url  VARCHAR(255),
    status          SMALLINT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE clinic IS '诊所信息表';
DROP TRIGGER IF EXISTS set_updated_at ON clinic;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON clinic
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS doctor (
    id              BIGSERIAL PRIMARY KEY,
    clinic_id       BIGINT NOT NULL REFERENCES clinic(id),
    doctor_name     VARCHAR(100) NOT NULL,
    doctor_name_en  VARCHAR(100),
    reg_no          VARCHAR(50),
    signature_url   VARCHAR(255),
    login_account   VARCHAR(100) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    status          SMALLINT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE doctor IS '医生信息表';
CREATE INDEX IF NOT EXISTS idx_doctor_clinic ON doctor(clinic_id);
DROP TRIGGER IF EXISTS set_updated_at ON doctor;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON doctor
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS insurance_company (
    id              BIGSERIAL PRIMARY KEY,
    company_code    VARCHAR(50) NOT NULL UNIQUE,
    company_name    VARCHAR(200) NOT NULL,
    company_name_en VARCHAR(200),
    logo_url        VARCHAR(255),
    contact_info    VARCHAR(255),
    status          SMALLINT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE insurance_company IS '保险公司信息表';
DROP TRIGGER IF EXISTS set_updated_at ON insurance_company;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON insurance_company
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS clinic_insurance_company (
    id              BIGSERIAL PRIMARY KEY,
    clinic_id       BIGINT NOT NULL REFERENCES clinic(id),
    company_id      BIGINT NOT NULL REFERENCES insurance_company(id),
    status          SMALLINT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (clinic_id, company_id)
);
COMMENT ON TABLE clinic_insurance_company IS '诊所-保险公司可用关系表';

-- ============================================================
-- 1.4 保单模板
-- ============================================================
CREATE TABLE IF NOT EXISTS policy_template (
    id                  BIGSERIAL PRIMARY KEY,
    company_id          BIGINT NOT NULL REFERENCES insurance_company(id),
    template_name       VARCHAR(200) NOT NULL,
    template_code       VARCHAR(50) NOT NULL,
    version             VARCHAR(20) NOT NULL DEFAULT 'V1',
    original_pdf_url    VARCHAR(255) NOT NULL,
    page_count          INT DEFAULT 1,
    page_width          NUMERIC(10,2),
    page_height         NUMERIC(10,2),
    parse_status        VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    parse_progress      SMALLINT NOT NULL DEFAULT 0,
    parse_message       VARCHAR(255),
    parse_job_id        VARCHAR(64),
    parse_error         TEXT,
    is_active           BOOLEAN DEFAULT FALSE,
    created_by          BIGINT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE policy_template IS '保单模板主表(含版本历史)';
CREATE INDEX IF NOT EXISTS idx_template_company ON policy_template(company_id);
CREATE INDEX IF NOT EXISTS idx_template_code_active ON policy_template(template_code, is_active);
DROP TRIGGER IF EXISTS set_updated_at ON policy_template;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON policy_template
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS clinic_policy_template (
    id              BIGSERIAL PRIMARY KEY,
    clinic_id       BIGINT NOT NULL REFERENCES clinic(id),
    template_id     BIGINT NOT NULL REFERENCES policy_template(id),
    status          SMALLINT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (clinic_id, template_id)
);
COMMENT ON TABLE clinic_policy_template IS '诊所-保单模板可用关系表';

CREATE TABLE IF NOT EXISTS template_field (
    id                  BIGSERIAL PRIMARY KEY,
    template_id         BIGINT NOT NULL REFERENCES policy_template(id) ON DELETE CASCADE,
    page_no             INT NOT NULL DEFAULT 1,
    field_label_raw     VARCHAR(255),
    pdf_field_name      VARCHAR(255),
    field_type          VARCHAR(20) NOT NULL,
    pos_x               NUMERIC(10,2) NOT NULL,
    pos_y               NUMERIC(10,2) NOT NULL,
    width               NUMERIC(10,2) NOT NULL,
    height              NUMERIC(10,2) NOT NULL,
    font_size           NUMERIC(5,2) DEFAULT 10,
    recognize_source    VARCHAR(20) NOT NULL,
    confidence_score    NUMERIC(5,2),
    is_confirmed        BOOLEAN DEFAULT FALSE,
    field_status        VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    ignore_reason       VARCHAR(255),
    row_version         INT NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE template_field IS '模板字段表(PDF识别出的原始字段位置信息)';
CREATE INDEX IF NOT EXISTS idx_template_field_template ON template_field(template_id);
DROP TRIGGER IF EXISTS set_updated_at ON template_field;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON template_field
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS template_field_mapping (
    id                  BIGSERIAL PRIMARY KEY,
    template_field_id   BIGINT NOT NULL UNIQUE REFERENCES template_field(id) ON DELETE CASCADE,
    standard_field_id   BIGINT REFERENCES standard_field(id),
    transform_rule_id   BIGINT REFERENCES field_transform_rule(id),
    fixed_value         VARCHAR(255),
    checkbox_map_value  VARCHAR(100),
    template_specific_field_code VARCHAR(100),
    template_specific_ai_hint TEXT,
    annotated_by        BIGINT,
    annotated_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    CHECK (
        standard_field_id IS NOT NULL
        OR fixed_value IS NOT NULL
        OR (template_specific_field_code IS NOT NULL AND template_specific_ai_hint IS NOT NULL)
    )
);
COMMENT ON TABLE template_field_mapping IS '模板字段-标准字段映射关系表(核心配置表)';
DROP TRIGGER IF EXISTS set_updated_at ON template_field_mapping;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON template_field_mapping
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- 1.5 医生端填报业务
-- ============================================================
-- Must precede claim_submission: claim_submission.extraction_task_id has this FK.
CREATE TABLE IF NOT EXISTS extraction_task (
    id                  BIGSERIAL PRIMARY KEY,
    task_no             VARCHAR(50) NOT NULL UNIQUE,
    clinic_id           BIGINT NOT NULL REFERENCES clinic(id),
    doctor_id           BIGINT NOT NULL REFERENCES doctor(id),
    patient_name        VARCHAR(100),
    original_filename   VARCHAR(255) NOT NULL,
    pdf_url             VARCHAR(512) NOT NULL,
    file_size_bytes     INT NOT NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'WAITING',
    current_step        VARCHAR(30),
    error_message       TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_extraction_task_clinic ON extraction_task(clinic_id);
CREATE INDEX IF NOT EXISTS idx_extraction_task_status ON extraction_task(status);
DROP TRIGGER IF EXISTS set_updated_at ON extraction_task;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON extraction_task
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS claim_submission (
    id                  BIGSERIAL PRIMARY KEY,
    submission_no       VARCHAR(50) NOT NULL UNIQUE,
    clinic_id           BIGINT NOT NULL REFERENCES clinic(id),
    doctor_id           BIGINT NOT NULL REFERENCES doctor(id),
    company_id          BIGINT NOT NULL REFERENCES insurance_company(id),
    template_id         BIGINT NOT NULL REFERENCES policy_template(id),
    template_version    VARCHAR(20),
    patient_name        VARCHAR(100),
    medical_record_text TEXT,
    ai_raw_result       JSONB,
    final_field_values  JSONB,
    field_confirmations JSONB,
    row_version         INT NOT NULL DEFAULT 1,
    ai_token_usage      INT,
    generated_pdf_url   VARCHAR(255),
    status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    ai_process_time_ms  INT,
    extraction_task_id  BIGINT REFERENCES extraction_task(id) ON DELETE SET NULL,
    extract_status      VARCHAR(30) NOT NULL DEFAULT 'IDLE',
    extract_stage       VARCHAR(30),
    extract_progress    INT NOT NULL DEFAULT 0,
    extract_message     VARCHAR(255),
    extract_job_id      VARCHAR(100),
    extract_manifest    JSONB,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE claim_submission IS '填报记录主表';
CREATE INDEX IF NOT EXISTS idx_claim_clinic ON claim_submission(clinic_id);
CREATE INDEX IF NOT EXISTS idx_claim_doctor ON claim_submission(doctor_id);
CREATE INDEX IF NOT EXISTS idx_claim_status ON claim_submission(status);
CREATE INDEX IF NOT EXISTS idx_claim_final_values_gin ON claim_submission USING GIN (final_field_values);
CREATE INDEX IF NOT EXISTS idx_claim_extraction_task ON claim_submission(extraction_task_id);
DROP TRIGGER IF EXISTS set_updated_at ON claim_submission;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON claim_submission
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS claim_field_change_log (
    id                  BIGSERIAL PRIMARY KEY,
    submission_id       BIGINT NOT NULL REFERENCES claim_submission(id) ON DELETE CASCADE,
    standard_field_id   BIGINT NOT NULL REFERENCES standard_field(id),
    ai_original_value   TEXT,
    final_value         TEXT,
    is_modified         BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE claim_field_change_log IS '填报字段修改明细表(AI准确率统计/审计追溯)';
CREATE INDEX IF NOT EXISTS idx_change_log_submission ON claim_field_change_log(submission_id);
CREATE INDEX IF NOT EXISTS idx_change_log_field ON claim_field_change_log(standard_field_id);

-- ============================================================
-- 1.6 权限与日志
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_user (
    id              BIGSERIAL PRIMARY KEY,
    username        VARCHAR(100) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    real_name       VARCHAR(100),
    role            VARCHAR(20) NOT NULL DEFAULT 'OPERATOR',
    status          SMALLINT NOT NULL DEFAULT 1,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE admin_user IS '后台管理员表';
DROP TRIGGER IF EXISTS set_updated_at ON admin_user;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON admin_user
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS operation_log (
    id              BIGSERIAL PRIMARY KEY,
    operator_type   VARCHAR(20) NOT NULL,
    operator_id     BIGINT NOT NULL,
    operation_type  VARCHAR(50) NOT NULL,
    target_type     VARCHAR(50),
    target_id       BIGINT,
    ip_address      VARCHAR(50),
    request_detail  JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE operation_log IS '系统操作日志表(合规审计用)';
CREATE INDEX IF NOT EXISTS idx_oplog_operator ON operation_log(operator_type, operator_id);
CREATE INDEX IF NOT EXISTS idx_oplog_target ON operation_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_oplog_created ON operation_log(created_at);

-- ============================================================
-- 1.7 病历 PDF 智能提取任务
-- ============================================================
CREATE TABLE IF NOT EXISTS extraction_task (
    id                  BIGSERIAL PRIMARY KEY,
    task_no             VARCHAR(50) NOT NULL UNIQUE,
    clinic_id           BIGINT NOT NULL REFERENCES clinic(id),
    doctor_id           BIGINT NOT NULL REFERENCES doctor(id),
    patient_name        VARCHAR(100),
    original_filename   VARCHAR(255) NOT NULL,
    pdf_url             VARCHAR(512) NOT NULL,
    file_size_bytes     INT NOT NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'WAITING',
    current_step        VARCHAR(30),
    error_message       TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE extraction_task IS '病历PDF智能提取流水线任务表';
CREATE INDEX IF NOT EXISTS idx_extraction_task_clinic ON extraction_task(clinic_id);
CREATE INDEX IF NOT EXISTS idx_extraction_task_status ON extraction_task(status);
DROP TRIGGER IF EXISTS set_updated_at ON extraction_task;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON extraction_task
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS document_page (
    id                  BIGSERIAL PRIMARY KEY,
    task_id             BIGINT NOT NULL REFERENCES extraction_task(id) ON DELETE CASCADE,
    page_no             INT NOT NULL,
    source              VARCHAR(20) NOT NULL,
    text                TEXT,
    image_path          VARCHAR(512),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_document_page_task_page UNIQUE (task_id, page_no)
);
COMMENT ON TABLE document_page IS 'Step2输出：每页文本层或扫描图路径';
CREATE INDEX IF NOT EXISTS idx_document_page_task ON document_page(task_id);
DROP TRIGGER IF EXISTS set_updated_at ON document_page;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON document_page
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS ocr_result (
    id                  BIGSERIAL PRIMARY KEY,
    task_id             BIGINT NOT NULL REFERENCES extraction_task(id) ON DELETE CASCADE,
    page_no             INT NOT NULL,
    blocks              JSONB NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_ocr_result_task_page UNIQUE (task_id, page_no)
);
COMMENT ON TABLE ocr_result IS 'Step3输出：每页OCR blocks（含bbox/confidence）';
CREATE INDEX IF NOT EXISTS idx_ocr_result_task ON ocr_result(task_id);
DROP TRIGGER IF EXISTS set_updated_at ON ocr_result;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ocr_result
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS document_classification (
    id                  BIGSERIAL PRIMARY KEY,
    task_id             BIGINT NOT NULL UNIQUE REFERENCES extraction_task(id) ON DELETE CASCADE,
    document_type       VARCHAR(80) NOT NULL,
    language            VARCHAR(20) NOT NULL,
    multiple_patient    BOOLEAN NOT NULL,
    multiple_visit      BOOLEAN NOT NULL,
    insurance_company   VARCHAR(100),
    need_visit_selector BOOLEAN NOT NULL,
    source_text_chars   INT NOT NULL DEFAULT 0,
    source_pages_used   INT NOT NULL DEFAULT 0,
    model_name          VARCHAR(100),
    token_usage         INT NOT NULL DEFAULT 0,
    stub                BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE document_classification IS 'Step4输出：文档级分类结果';
CREATE INDEX IF NOT EXISTS idx_document_classification_task ON document_classification(task_id);
DROP TRIGGER IF EXISTS set_updated_at ON document_classification;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON document_classification
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS extraction_visit (
    id                  BIGSERIAL PRIMARY KEY,
    task_id             BIGINT NOT NULL REFERENCES extraction_task(id) ON DELETE CASCADE,
    visit_index         INT NOT NULL,
    visit_date          VARCHAR(20),
    summary             TEXT,
    page_start          INT NOT NULL,
    page_end            INT NOT NULL,
    selected            BOOLEAN NOT NULL DEFAULT FALSE,
    model_name          VARCHAR(100),
    token_usage         INT NOT NULL DEFAULT 0,
    stub                BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_extraction_visit_task_index UNIQUE (task_id, visit_index)
);
COMMENT ON TABLE extraction_visit IS 'Step5输出：候选就诊记录 + 用户选择';
CREATE INDEX IF NOT EXISTS idx_extraction_visit_task ON extraction_visit(task_id);
DROP TRIGGER IF EXISTS set_updated_at ON extraction_visit;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON extraction_visit
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS extraction_prompt (
    id                  BIGSERIAL PRIMARY KEY,
    task_id             BIGINT NOT NULL UNIQUE REFERENCES extraction_task(id) ON DELETE CASCADE,
    prompt_text         TEXT NOT NULL,
    field_codes         JSONB NOT NULL,
    selected_visit_index INT,
    source_text_chars   INT NOT NULL DEFAULT 0,
    source_pages_used   INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE extraction_prompt IS 'Step6输出：字段提取Prompt';
CREATE INDEX IF NOT EXISTS idx_extraction_prompt_task ON extraction_prompt(task_id);
DROP TRIGGER IF EXISTS set_updated_at ON extraction_prompt;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON extraction_prompt
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS extraction_result (
    id                  BIGSERIAL PRIMARY KEY,
    task_id             BIGINT NOT NULL UNIQUE REFERENCES extraction_task(id) ON DELETE CASCADE,
    fields              JSONB NOT NULL,
    model_name          VARCHAR(100),
    token_usage         INT NOT NULL DEFAULT 0,
    stub                BOOLEAN NOT NULL DEFAULT FALSE,
    stage               VARCHAR(20) NOT NULL DEFAULT 'raw',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE extraction_result IS 'Step7输出：字段级提取结果（raw）';
CREATE INDEX IF NOT EXISTS idx_extraction_result_task ON extraction_result(task_id);
DROP TRIGGER IF EXISTS set_updated_at ON extraction_result;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON extraction_result
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS extraction_mapped_result (
    id                  BIGSERIAL PRIMARY KEY,
    task_id             BIGINT NOT NULL UNIQUE REFERENCES extraction_task(id) ON DELETE CASCADE,
    insurance_company   VARCHAR(100) NOT NULL,
    template_id         BIGINT REFERENCES policy_template(id) ON DELETE SET NULL,
    mapping_source      VARCHAR(20) NOT NULL DEFAULT 'fallback',
    fields              JSONB NOT NULL,
    unmapped_fields     JSONB NOT NULL DEFAULT '[]',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE extraction_mapped_result IS 'Step10输出：按保险公司字段名映射后的结果';
CREATE INDEX IF NOT EXISTS idx_extraction_mapped_result_task ON extraction_mapped_result(task_id);
DROP TRIGGER IF EXISTS set_updated_at ON extraction_mapped_result;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON extraction_mapped_result
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS extraction_review_output (
    id                  BIGSERIAL PRIMARY KEY,
    task_id             BIGINT NOT NULL UNIQUE REFERENCES extraction_task(id) ON DELETE CASCADE,
    insurance_company   VARCHAR(100),
    standard_fields     JSONB NOT NULL,
    edited_fields       JSONB,
    mapped_fields       JSONB,
    is_confirmed        BOOLEAN NOT NULL DEFAULT FALSE,
    reviewed_by_id      BIGINT REFERENCES doctor(id),
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE extraction_review_output IS 'Step11输出：标准JSON + 人工审核结果';
CREATE INDEX IF NOT EXISTS idx_extraction_review_output_task ON extraction_review_output(task_id);
DROP TRIGGER IF EXISTS set_updated_at ON extraction_review_output;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON extraction_review_output
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

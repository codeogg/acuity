-- Apply missing PDF extraction pipeline schema for local dev DBs
-- Safe to re-run (IF NOT EXISTS / IF NOT EXISTS constraint checks)

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
CREATE INDEX IF NOT EXISTS idx_document_page_task ON document_page(task_id);

CREATE TABLE IF NOT EXISTS ocr_result (
    id                  BIGSERIAL PRIMARY KEY,
    task_id             BIGINT NOT NULL REFERENCES extraction_task(id) ON DELETE CASCADE,
    page_no             INT NOT NULL,
    blocks              JSONB NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_ocr_result_task_page UNIQUE (task_id, page_no)
);
CREATE INDEX IF NOT EXISTS idx_ocr_result_task ON ocr_result(task_id);

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

ALTER TABLE claim_submission ADD COLUMN IF NOT EXISTS extraction_task_id BIGINT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_extraction_task'
  ) THEN
    ALTER TABLE claim_submission
      ADD CONSTRAINT fk_claim_extraction_task
      FOREIGN KEY (extraction_task_id) REFERENCES extraction_task(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_claim_extraction_task ON claim_submission(extraction_task_id);

UPDATE alembic_version SET version_num = '011_claim_extraction_task';

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('examinee', 'admin');

-- CreateEnum
CREATE TYPE "DebateRole" AS ENUM ('PM', 'LO', 'MG', 'MO', 'LOR', 'PMR');

-- CreateEnum
CREATE TYPE "DebateSide" AS ENUM ('government', 'opposition');

-- CreateEnum
CREATE TYPE "SpeechType" AS ENUM ('constructive', 'reply');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('created', 'preparing', 'listening', 'recording', 'uploaded', 'processing', 'scored', 'failed', 'abandoned');

-- CreateEnum
CREATE TYPE "AssessmentSource" AS ENUM ('web', 'zoom', 'teams', 'meet');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('en', 'ja');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('video', 'audio_extracted', 'tts_audio');

-- CreateEnum
CREATE TYPE "MediaRetention" AS ENUM ('delete_after_scoring', 'keep');

-- CreateEnum
CREATE TYPE "EvaluationSource" AS ENUM ('ai', 'admin_edit');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'examinee',
    "ui_language" "Language" NOT NULL DEFAULT 'ja',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motions" (
    "id" UUID NOT NULL,
    "text_en" TEXT NOT NULL,
    "text_ja" TEXT,
    "category" TEXT,
    "difficulty" INTEGER,
    "target_roles" "DebateRole"[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "motions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_specs" (
    "id" UUID NOT NULL,
    "role" "DebateRole" NOT NULL,
    "side" "DebateSide" NOT NULL,
    "speech_type" "SpeechType" NOT NULL,
    "label_ja" TEXT NOT NULL,
    "time_limits" JSONB NOT NULL,
    "required_elements" JSONB NOT NULL,
    "inputs" JSONB NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "role_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "DebateRole" NOT NULL,
    "motion_id" UUID NOT NULL,
    "language" "Language" NOT NULL DEFAULT 'en',
    "status" "AssessmentStatus" NOT NULL DEFAULT 'created',
    "status_detail" JSONB NOT NULL DEFAULT '{}',
    "source" "AssessmentSource" NOT NULL DEFAULT 'web',
    "settings_snapshot" JSONB NOT NULL DEFAULT '{}',
    "prep_started_at" TIMESTAMP(3),
    "recording_started_at" TIMESTAMP(3),
    "recording_ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_speeches" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "role" "DebateRole" NOT NULL,
    "script" TEXT NOT NULL,
    "structure" JSONB NOT NULL DEFAULT '{}',
    "llm_model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "audio_storage_key" TEXT,
    "duration_sec" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_speeches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_files" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "size_bytes" BIGINT,
    "mime_type" TEXT,
    "duration_sec" DOUBLE PRECISION,
    "retention" "MediaRetention" NOT NULL DEFAULT 'delete_after_scoring',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "words" JSONB NOT NULL DEFAULT '[]',
    "stt_provider" TEXT NOT NULL,
    "stt_model" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_metrics" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "speech_duration_sec" DOUBLE PRECISION NOT NULL,
    "silence_ratio" DOUBLE PRECISION NOT NULL,
    "longest_silence_sec" DOUBLE PRECISION NOT NULL,
    "words_per_minute" DOUBLE PRECISION NOT NULL,
    "loudness_stats" JSONB NOT NULL DEFAULT '{}',
    "pitch_stats" JSONB NOT NULL DEFAULT '{}',
    "eye_contact_ratio" DOUBLE PRECISION,
    "frame_findings" JSONB NOT NULL DEFAULT '[]',
    "frames_analyzed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubric_versions" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "judge_prompt_version" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rubric_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "rubric_version_id" UUID NOT NULL,
    "source" "EvaluationSource" NOT NULL,
    "supersedes_id" UUID,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "matter_score" INTEGER NOT NULL,
    "manner_score" INTEGER NOT NULL,
    "total_score" INTEGER NOT NULL,
    "matter_grade" TEXT NOT NULL,
    "manner_grade" TEXT NOT NULL,
    "pd_level" TEXT,
    "cefr_reference" TEXT,
    "good_points" TEXT NOT NULL DEFAULT '',
    "improvement_points" TEXT NOT NULL DEFAULT '',
    "overall_comments" TEXT NOT NULL DEFAULT '',
    "gates" JSONB NOT NULL DEFAULT '[]',
    "llm_model" TEXT,
    "prompt_version" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_items" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "item_key" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "criteria_results" JSONB NOT NULL,
    "rationale" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "evaluation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_revisions" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "editor_id" UUID NOT NULL,
    "diff" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by" UUID,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "role_specs_role_key" ON "role_specs"("role");

-- CreateIndex
CREATE INDEX "assessments_user_id_created_at_idx" ON "assessments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "assessments_status_idx" ON "assessments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "generated_speeches_assessment_id_role_key" ON "generated_speeches"("assessment_id", "role");

-- CreateIndex
CREATE INDEX "media_files_assessment_id_idx" ON "media_files"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "transcripts_assessment_id_key" ON "transcripts"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_metrics_assessment_id_key" ON "delivery_metrics"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "rubric_versions_version_key" ON "rubric_versions"("version");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_supersedes_id_key" ON "evaluations"("supersedes_id");

-- CreateIndex
CREATE INDEX "evaluations_assessment_id_is_current_idx" ON "evaluations"("assessment_id", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_items_evaluation_id_item_key_key" ON "evaluation_items"("evaluation_id", "item_key");

-- CreateIndex
CREATE INDEX "reports_assessment_id_idx" ON "reports"("assessment_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "motions" ADD CONSTRAINT "motions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_motion_id_fkey" FOREIGN KEY ("motion_id") REFERENCES "motions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_speeches" ADD CONSTRAINT "generated_speeches_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_metrics" ADD CONSTRAINT "delivery_metrics_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_rubric_version_id_fkey" FOREIGN KEY ("rubric_version_id") REFERENCES "rubric_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "evaluations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_items" ADD CONSTRAINT "evaluation_items_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_revisions" ADD CONSTRAINT "evaluation_revisions_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_revisions" ADD CONSTRAINT "evaluation_revisions_editor_id_fkey" FOREIGN KEY ("editor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

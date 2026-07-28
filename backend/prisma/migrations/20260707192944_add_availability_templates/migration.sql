-- CreateEnum
CREATE TYPE "ConsultType" AS ENUM ('ONLINE', 'CLINIC');

-- AlterTable
ALTER TABLE "availability_slots" ADD COLUMN     "consult_type" "ConsultType" NOT NULL DEFAULT 'ONLINE';

-- CreateTable
CREATE TABLE "availability_templates" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "consult_type" "ConsultType" NOT NULL DEFAULT 'ONLINE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "availability_templates_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "availability_templates" ADD CONSTRAINT "availability_templates_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

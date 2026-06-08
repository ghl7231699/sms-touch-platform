-- AlterTable
ALTER TABLE "sms_rule" ADD COLUMN     "conditionConfig" JSONB;

-- AlterTable
ALTER TABLE "sms_task" ADD COLUMN     "conditionCheckedAt" TIMESTAMP(3),
ADD COLUMN     "conditionReason" TEXT,
ADD COLUMN     "conditionResult" TEXT;

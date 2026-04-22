-- CreateTable
CREATE TABLE "LeadEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lead_id" TEXT,
    "phone" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

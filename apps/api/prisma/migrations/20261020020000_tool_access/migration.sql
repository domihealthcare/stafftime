-- Who may use each built-in form and guide (October 2026, Dominguez): everyone,
-- or chosen job roles. A tool with no row keeps its default (tools.ts).

-- CreateTable
CREATE TABLE "tool_access" (
    "tool" TEXT NOT NULL,
    "everyone" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_access_pkey" PRIMARY KEY ("tool")
);

-- CreateTable
CREATE TABLE "tool_access_roles" (
    "tool" TEXT NOT NULL,
    "jobRoleId" UUID NOT NULL,

    CONSTRAINT "tool_access_roles_pkey" PRIMARY KEY ("tool","jobRoleId")
);

-- AddForeignKey
ALTER TABLE "tool_access_roles" ADD CONSTRAINT "tool_access_roles_tool_fkey" FOREIGN KEY ("tool") REFERENCES "tool_access"("tool") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_access_roles" ADD CONSTRAINT "tool_access_roles_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "job_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


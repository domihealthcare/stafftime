-- News posts get comments, likes and polls (October 2026, Dominguez).
-- Additive only: new tables, and a new kind of bell notification.
-- Likes and poll votes are named on purpose; see AnnouncementPoll.

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'NEWS_COMMENT';

-- CreateTable
CREATE TABLE "announcement_comments" (
    "id" UUID NOT NULL,
    "announcementId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcement_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_likes" (
    "announcementId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_likes_pkey" PRIMARY KEY ("announcementId","employeeId")
);

-- CreateTable
CREATE TABLE "announcement_polls" (
    "id" UUID NOT NULL,
    "announcementId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "allowsMultiple" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_poll_options" (
    "id" UUID NOT NULL,
    "pollId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "announcement_poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_poll_votes" (
    "pollId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_poll_votes_pkey" PRIMARY KEY ("optionId","employeeId")
);

-- CreateIndex
CREATE INDEX "announcement_comments_announcementId_createdAt_idx" ON "announcement_comments"("announcementId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_polls_announcementId_key" ON "announcement_polls"("announcementId");

-- CreateIndex
CREATE INDEX "announcement_poll_options_pollId_position_idx" ON "announcement_poll_options"("pollId", "position");

-- CreateIndex
CREATE INDEX "announcement_poll_votes_pollId_employeeId_idx" ON "announcement_poll_votes"("pollId", "employeeId");

-- AddForeignKey
ALTER TABLE "announcement_comments" ADD CONSTRAINT "announcement_comments_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_comments" ADD CONSTRAINT "announcement_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_likes" ADD CONSTRAINT "announcement_likes_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_likes" ADD CONSTRAINT "announcement_likes_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_polls" ADD CONSTRAINT "announcement_polls_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_poll_options" ADD CONSTRAINT "announcement_poll_options_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "announcement_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_poll_votes" ADD CONSTRAINT "announcement_poll_votes_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "announcement_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_poll_votes" ADD CONSTRAINT "announcement_poll_votes_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "announcement_poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_poll_votes" ADD CONSTRAINT "announcement_poll_votes_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;


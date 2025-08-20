/*
  Warnings:

  - You are about to drop the column `owner_id` on the `rooms` table. All the data in the column will be lost.
  - Made the column `delivered_at` on table `message_receipts` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `rooms` DROP FOREIGN KEY `rooms_owner_id_fkey`;

-- DropIndex
DROP INDEX `rooms_owner_id_fkey` ON `rooms`;

-- AlterTable
ALTER TABLE `message_receipts` MODIFY `delivered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `room_members` ADD COLUMN `role` ENUM('owner', 'member') NOT NULL DEFAULT 'member';

-- AlterTable
ALTER TABLE `rooms` DROP COLUMN `owner_id`,
    ADD COLUMN `is_private` BOOLEAN NOT NULL DEFAULT false;

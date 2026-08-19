-- DropIndex
DROP INDEX "Example_tatoebaId_key";

-- AlterTable
ALTER TABLE "Example" DROP COLUMN "tatoebaId",
ADD COLUMN     "audioSlowUrl" TEXT,
ADD COLUMN     "audioUrl" TEXT,
ADD COLUMN     "hskLevel" INTEGER,
ADD COLUMN     "pinyin" TEXT;


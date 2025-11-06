import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUrlTable1762415242522 implements MigrationInterface {
    name = 'CreateUrlTable1762415242522'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "clicks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "urlId" uuid NOT NULL, "ipAddress" character varying(45) NOT NULL, "userAgent" text, "referer" text, "browser" character varying(50), "browserVersion" character varying(50), "os" character varying(50), "osVersion" character varying(50), "deviceType" character varying(20), "country" character varying(2), "city" character varying(100), "latitude" numeric(10,8), "longitude" numeric(11,8), "timezone" character varying(50), CONSTRAINT "PK_7765d7ffdeb0ed2675651020814" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_854da72fb8c782d927e0d57c85" ON "clicks" ("country") `);
        await queryRunner.query(`CREATE INDEX "IDX_6f944344e22b36f7f0a5a1d2de" ON "clicks" ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_0c0f99629ebbd68ae9a4ac8b11" ON "clicks" ("urlId", "createdAt") `);
        await queryRunner.query(`CREATE TABLE "urls" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "originalUrl" text NOT NULL, "shortCode" character varying(10) NOT NULL, "customAlias" character varying(50), "title" character varying(255), "userId" character varying(100), "clickCount" integer NOT NULL DEFAULT '0', "expiresAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "password" character varying(50), CONSTRAINT "UQ_34ced802e4a45bf6a6346f2eb97" UNIQUE ("shortCode"), CONSTRAINT "PK_eaf7bec915960b26aa4988d73b0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d79ee3778b01205238c90d34bc" ON "urls" ("expiresAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_3088b58113241e3f5f6c10cf1f" ON "urls" ("userId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_34ced802e4a45bf6a6346f2eb9" ON "urls" ("shortCode") `);
        await queryRunner.query(`ALTER TABLE "clicks" ADD CONSTRAINT "FK_64f313b1242214dad37f4c22856" FOREIGN KEY ("urlId") REFERENCES "urls"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clicks" DROP CONSTRAINT "FK_64f313b1242214dad37f4c22856"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_34ced802e4a45bf6a6346f2eb9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3088b58113241e3f5f6c10cf1f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d79ee3778b01205238c90d34bc"`);
        await queryRunner.query(`DROP TABLE "urls"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0c0f99629ebbd68ae9a4ac8b11"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6f944344e22b36f7f0a5a1d2de"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_854da72fb8c782d927e0d57c85"`);
        await queryRunner.query(`DROP TABLE "clicks"`);
    }

}

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMaxClicksToUrls1762850393473 implements MigrationInterface {
    name = 'AddMaxClicksToUrls1762850393473'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "urls" ADD "maxClicks" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "urls" DROP COLUMN "password"`);
        await queryRunner.query(`ALTER TABLE "urls" ADD "password" character varying(60)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "urls" DROP COLUMN "password"`);
        await queryRunner.query(`ALTER TABLE "urls" ADD "password" character varying(50)`);
        await queryRunner.query(`ALTER TABLE "urls" DROP COLUMN "maxClicks"`);
    }

}

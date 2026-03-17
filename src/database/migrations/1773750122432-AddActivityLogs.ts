import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActivityLogs1773750122432 implements MigrationInterface {
  name = 'AddActivityLogs1773750122432';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "activity_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid, "method" character varying(10) NOT NULL, "path" character varying(500) NOT NULL, "status_code" integer NOT NULL, "ip_address" character varying(45), "user_agent" character varying(500), "response_time_ms" integer, "metadata" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f25287b6140c5ba18d38776a796" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_activity_user_created" ON "activity_logs" ("user_id", "created_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_activity_user_created"`);
    await queryRunner.query(`DROP TABLE "activity_logs"`);
  }
}

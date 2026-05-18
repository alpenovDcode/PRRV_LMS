-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "last_mentor_call_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tg_custom_fields" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tg_lists" ALTER COLUMN "updated_at" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "tg_audit_log_action_createdAt_idx" RENAME TO "tg_audit_log_action_created_at_idx";

-- RenameIndex
ALTER INDEX "tg_audit_log_actorUserId_createdAt_idx" RENAME TO "tg_audit_log_actor_user_id_created_at_idx";

-- RenameIndex
ALTER INDEX "tg_audit_log_botId_createdAt_idx" RENAME TO "tg_audit_log_bot_id_created_at_idx";

-- RenameIndex
ALTER INDEX "tg_custom_fields_botId_sortOrder_idx" RENAME TO "tg_custom_fields_bot_id_sort_order_idx";

-- RenameIndex
ALTER INDEX "tg_custom_fields_bot_key_unique" RENAME TO "tg_custom_fields_bot_id_key_key";

-- RenameIndex
ALTER INDEX "tg_flow_runs_subscriberId_positionGroupId_status_idx" RENAME TO "tg_flow_runs_subscriber_id_position_group_id_status_idx";

-- RenameIndex
ALTER INDEX "tg_lists_botId_idx" RENAME TO "tg_lists_bot_id_idx";

-- RenameIndex
ALTER INDEX "tg_lists_bot_name_unique" RENAME TO "tg_lists_bot_id_name_key";

-- RenameIndex
ALTER INDEX "tg_media_files_botId_fileUniqueId_idx" RENAME TO "tg_media_files_bot_id_file_unique_id_idx";

-- RenameIndex
ALTER INDEX "tg_media_files_botId_kind_createdAt_idx" RENAME TO "tg_media_files_bot_id_kind_created_at_idx";

-- RenameIndex
ALTER INDEX "tg_redirect_links_botId_createdAt_idx" RENAME TO "tg_redirect_links_bot_id_created_at_idx";

-- RenameIndex
ALTER INDEX "tg_redirect_links_slug_unique" RENAME TO "tg_redirect_links_slug_key";

-- RenameIndex
ALTER INDEX "tg_redirect_links_subscriberId_idx" RENAME TO "tg_redirect_links_subscriber_id_idx";

-- RenameIndex
ALTER INDEX "tg_subscriber_lists_listId_joinedAt_idx" RENAME TO "tg_subscriber_lists_list_id_joined_at_idx";

-- RenameIndex
ALTER INDEX "tg_subscriber_lists_subscriberId_idx" RENAME TO "tg_subscriber_lists_subscriber_id_idx";

-- RenameIndex
ALTER INDEX "tg_subscriber_lists_unique" RENAME TO "tg_subscriber_lists_list_id_subscriber_id_key";

-- RenameIndex
ALTER INDEX "tg_subscribers_botId_currentPositionFlowId_currentPositionNodeI" RENAME TO "tg_subscribers_bot_id_current_position_flow_id_current_posi_idx";

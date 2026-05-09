-- Migration: group_members — allow self-leave (DELETE own membership)
-- Feature: show-up-2-move
-- Task: 22.1 Implement leave group action
-- Requirements: 16.2, 16.3
--
-- The initial RLS setup (20240001000004_rls_policies.sql) only defined a
-- SELECT policy on `group_members`. To let a user leave a group from the
-- frontend we need a DELETE policy that allows users to remove only their
-- own membership row.

CREATE POLICY "group_members_delete_own"
  ON group_members FOR DELETE
  USING (user_id = auth.uid());

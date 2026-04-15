-- Add new roles in correct order
ALTER TYPE "public"."role" ADD VALUE 'AREA_MANAGER' BEFORE 'NVVP';
ALTER TYPE "public"."role" ADD VALUE 'BRANCH_MANAGER' BEFORE 'NVVP';
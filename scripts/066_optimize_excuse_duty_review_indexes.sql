-- Optimize Excuse Duty review queues used by /api/admin/excuse-duty.
-- These indexes support status/type/date filters plus newest-first paging.

CREATE INDEX IF NOT EXISTS idx_excuse_documents_status_created_id
  ON public.excuse_documents (status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_excuse_documents_status_type_created_id
  ON public.excuse_documents (status, document_type, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_excuse_documents_status_date_created_id
  ON public.excuse_documents (status, excuse_date, created_at DESC, id DESC);

ANALYZE public.excuse_documents;

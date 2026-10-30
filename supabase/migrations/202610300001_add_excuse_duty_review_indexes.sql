-- Keep the admin excuse-duty queue responsive as the document table grows.
CREATE INDEX IF NOT EXISTS excuse_documents_status_created_at_idx
  ON public.excuse_documents (status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS excuse_documents_user_id_idx
  ON public.excuse_documents (user_id);

CREATE INDEX IF NOT EXISTS user_profiles_department_id_idx
  ON public.user_profiles (department_id);

CREATE INDEX IF NOT EXISTS user_profiles_assigned_location_id_idx
  ON public.user_profiles (assigned_location_id);

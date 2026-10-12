CREATE POLICY audit_update ON "AuditLog" FOR UPDATE
USING (
  app_bypass()
  OR ("governmentId" IS NOT NULL AND app_visible("governmentId"))
)
WITH CHECK (
  app_bypass()
  OR ("governmentId" IS NOT NULL AND app_visible("governmentId"))
);

CREATE POLICY audit_delete ON "AuditLog" FOR DELETE
USING (
  app_bypass()
  OR ("governmentId" IS NOT NULL AND app_visible("governmentId"))
);

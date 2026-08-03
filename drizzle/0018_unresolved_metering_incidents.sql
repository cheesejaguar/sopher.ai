ALTER TABLE "authoring_incidents" DROP CONSTRAINT "authoring_incidents_category_check";--> statement-breakpoint
ALTER TABLE "authoring_incidents" ADD CONSTRAINT "authoring_incidents_category_check" CHECK ("authoring_incidents"."category" in (
  'dispatch', 'workflow_missing', 'stalled_heartbeat', 'invalid_pause',
  'completion_contradiction', 'cancellation_unconfirmed',
  'stale_reservation', 'event_persistence', 'unresolved_metering', 'operator_action'
));

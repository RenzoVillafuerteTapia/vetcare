import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Radio } from "lucide-react";
import { Link, useNavigate } from "react-router";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { usePermission, useSessionManager } from "@/features/auth/session-context";
import { ApiError, errorMessage, unwrap } from "@/lib/api-error";

import { appointmentTrackingKey, TRACKING } from "./queries";

/**
 * En el detalle de una cita con la llegada registrada: ir a su seguimiento o iniciarlo. El
 * seguimiento muestra al dueño en la app cada etapa del baño o la cirugía.
 */
export function AppointmentTracking({ appointmentId }: { appointmentId: string }) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canRead = usePermission("tracking:read");
  const canAdvance = usePermission("tracking:advance");
  const canManage = usePermission("appointments:manage");
  const canStart = canAdvance || canManage;

  const tracking = useQuery({
    queryKey: appointmentTrackingKey(appointmentId),
    queryFn: async () => {
      try {
        return await unwrap(
          api.GET("/api/v1/appointments/{appointment_id}/tracking", {
            params: { path: { appointment_id: appointmentId } },
          }),
        );
      } catch (error) {
        // Sin seguimiento todavía.
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: canRead,
  });

  const start = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/v1/appointments/{appointment_id}/tracking", {
          params: { path: { appointment_id: appointmentId } },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TRACKING });
      await navigate("/seguimiento");
    },
  });

  if (!canRead || tracking.isPending) return null;
  if (tracking.data) {
    return (
      <Link to="/seguimiento" className={buttonVariants({ variant: "outline" })}>
        <Radio aria-hidden /> Ver seguimiento (
        {tracking.data.stages.find((s) => s.state === "current")?.label})
      </Link>
    );
  }
  if (!canStart) return null;
  return (
    <div className="grid gap-2">
      {start.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(start.error)}</AlertDescription>
        </Alert>
      ) : null}
      <Button disabled={start.isPending} onClick={() => start.mutate()}>
        <Radio aria-hidden /> Iniciar seguimiento
      </Button>
      <p className="text-xs text-muted-foreground">
        El dueño verá en la app cada etapa y los avances que publiques.
      </p>
    </div>
  );
}

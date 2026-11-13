import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { PartyPopper } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { BackLink, Loading } from "@/components/appointments";
import { LiveBadge, StageProgress, StageTimeline, currentStageLabel } from "@/components/tracking";
import { Body, Card, Heading, Notice, Screen } from "@/components/ui";
import { errorMessage, unwrap } from "@/lib/api-error";
import { trackingKey } from "@/lib/queries";
import { formatDate, limaTime } from "@/lib/time";
import { useSessionManager } from "@/session/context";
import { colors, fonts, radius, spacing } from "@/theme/tokens";

/** El avance del baño o la cirugía, en vivo: se refresca solo cada pocos segundos. */
export default function TrackingScreen() {
  const { trackedId = "" } = useLocalSearchParams<{ trackedId: string }>();
  const { api } = useSessionManager();
  const tracking = useQuery({
    queryKey: trackingKey(trackedId),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/tracked-services/{service_id}", {
          params: { path: { service_id: trackedId } },
        }),
      ),
  });

  if (tracking.isPending) {
    return (
      <Screen tabs>
        <BackLink />
        <Loading label="Cargando el seguimiento…" />
      </Screen>
    );
  }
  if (tracking.isError) {
    return (
      <Screen tabs>
        <BackLink />
        <Notice tone="error">{errorMessage(tracking.error)}</Notice>
      </Screen>
    );
  }

  const s = tracking.data;
  const live = s.status === "in_progress";
  return (
    <Screen tabs onRefresh={() => tracking.refetch()}>
      <BackLink />
      <View style={{ gap: spacing(2) }}>
        <LiveBadge live={live} />
        <Heading style={{ fontSize: 28, lineHeight: 32 }}>
          {s.pet_name} · {s.service_name}
        </Heading>
        <Body muted>
          Empezó el {formatDate(s.started_at)} a las {limaTime(s.started_at)}.
        </Body>
      </View>

      {s.status === "ready" ? (
        <View style={styles.ready}>
          <PartyPopper size={22} color={colors.primaryForeground} />
          <Text style={styles.readyText}>
            {s.template === "surgery"
              ? `${s.pet_name} tiene el alta. Ya puedes pasar a recogerla.`
              : `${s.pet_name} está lista para recoger.`}
          </Text>
        </View>
      ) : s.status === "handed_over" ? (
        <Notice tone="success">
          Entregada{s.handed_over_at ? ` a las ${limaTime(s.handed_over_at)}` : ""}. ¡Gracias por
          confiar en nosotros!
        </Notice>
      ) : (
        <Card style={{ gap: spacing(3) }}>
          <Text style={styles.now}>Ahora: {currentStageLabel(s)}</Text>
          <StageProgress service={s} />
          {s.next_stage ? <Body muted>Sigue: {s.next_stage}</Body> : null}
        </Card>
      )}

      <Card>
        <Text style={styles.section}>Etapas</Text>
        <StageTimeline service={s} />
      </Card>

      <Card style={{ gap: spacing(3) }}>
        <Text style={styles.section}>Avances de la veterinaria</Text>
        {s.updates.length > 0 ? (
          s.updates.map((update) => (
            <View key={update.id} style={styles.update}>
              <Text style={styles.updateTime}>{limaTime(update.at)}</Text>
              <Body>{update.text}</Body>
            </View>
          ))
        ) : s.updates_hidden ? (
          <Body muted>
            Hay avances publicados, pero solo los ven quienes pueden ver la información clínica de
            la mascota.
          </Body>
        ) : (
          <Body muted>
            Todavía no hay avances. Te avisaremos cuando la veterinaria publique uno.
          </Body>
        )}
      </Card>

      {live ? (
        <Body muted style={{ fontSize: 13, textAlign: "center" }}>
          Esta pantalla se actualiza sola.
        </Body>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ready: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    padding: spacing(4),
  },
  readyText: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.primaryForeground,
  },
  now: { fontFamily: fonts.display, fontSize: 20, color: colors.foreground },
  section: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.foreground,
    marginBottom: spacing(2),
  },
  update: {
    gap: spacing(1),
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing(3),
  },
  updateTime: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.mutedForeground },
});

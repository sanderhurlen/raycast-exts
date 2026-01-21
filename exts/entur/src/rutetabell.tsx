import {
  ActionPanel,
  Action,
  Icon,
  List,
  Color,
  LocalStorage,
  showToast,
  Toast,
  Form,
  useNavigation,
} from "@raycast/api";
import { useFetch } from "@raycast/utils";
import { useState, useEffect } from "react";

interface Leg {
  mode: string;
  line?: {
    publicCode: string;
    name?: string;
  };
  fromEstimatedCall?: {
    aimedDepartureTime: string;
    expectedDepartureTime: string;
    quay: {
      name: string;
      publicCode?: string;
      stopPlace?: {
        name: string;
      };
    };
  };
  toEstimatedCall?: {
    aimedArrivalTime: string;
    expectedArrivalTime: string;
    quay: {
      name: string;
      stopPlace?: {
        name: string;
      };
    };
  };
}

interface TripPattern {
  startTime: string;
  duration: number;
  waitingTime: number;
  legs: Leg[];
}

interface TripResponse {
  data: {
    trip: {
      tripPatterns: TripPattern[];
    };
  };
}

const DEFAULT_FROM_ID = "NSR:StopPlace:59872";
const DEFAULT_TO_ID = "NSR:StopPlace:62339";

const GRAPHQL_QUERY = `
  query GetTrips($from: String!, $to: String!, $numTripPatterns: Int!) {
    trip(
      from: {
        place: $from
      },
      to: {
        place: $to
      },
      numTripPatterns: $numTripPatterns
    ) {
      tripPatterns {
        startTime
        waitingTime
        duration
        legs {
          mode
          line {
            publicCode
            name
          }
          fromEstimatedCall {
            aimedDepartureTime
            expectedDepartureTime
            quay {
              name
              publicCode
              stopPlace {
                name
              }
            }
          }
          toEstimatedCall {
            aimedArrivalTime
            expectedArrivalTime
            quay {
              name
              stopPlace {
                name
              }
            }
          }
        }
      }
    }
  }
`;

function getTransportIcon(mode: string): Icon {
  switch (mode.toLowerCase()) {
    case "rail":
      return Icon.Train;
    case "bus":
      return Icon.Car;
    case "tram":
      return Icon.Train;
    case "metro":
      return Icon.Train;
    default:
      return Icon.Circle;
  }
}

function getTransportColor(mode: string): Color {
  switch (mode.toLowerCase()) {
    case "rail":
      return Color.Red;
    case "bus":
      return Color.Green;
    case "tram":
      return Color.Blue;
    case "metro":
      return Color.Orange;
    default:
      return Color.SecondaryText;
  }
}

function calculateDelay(aimed: string, expected: string): number {
  const aimedTime = new Date(aimed).getTime();
  const expectedTime = new Date(expected).getTime();
  return Math.floor((expectedTime - aimedTime) / 60000);
}

function SetStopsForm({
  onSubmit,
}: {
  onSubmit: (from: string, to: string, fromName: string, toName: string) => void;
}) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [fromName, setFromName] = useState("");
  const [toName, setToName] = useState("");
  const { pop } = useNavigation();

  async function handleSubmit() {
    if (!fromId || !toId || !fromName || !toName) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Alle felt må fylles ut",
      });
      return;
    }

    await LocalStorage.setItem("fromStop", fromId);
    await LocalStorage.setItem("toStop", toId);
    await LocalStorage.setItem("fromStopName", fromName);
    await LocalStorage.setItem("toStopName", toName);

    onSubmit(fromId, toId, fromName, toName);
    pop();

    await showToast({
      style: Toast.Style.Success,
      title: "Stasjoner oppdatert",
      message: `${fromName} → ${toName}`,
    });
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Lagre stasjoner" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="Sett fra- og til-stasjon. Bruk NSR StopPlace ID fra Entur." />
      <Form.TextField
        id="fromId"
        title="Fra stasjon ID"
        placeholder="NSR:StopPlace:337"
        value={fromId}
        onChange={setFromId}
      />
      <Form.TextField
        id="fromName"
        title="Fra stasjon navn"
        placeholder="Oslo S"
        value={fromName}
        onChange={setFromName}
      />
      <Form.TextField
        id="toId"
        title="Til stasjon ID"
        placeholder="NSR:StopPlace:338"
        value={toId}
        onChange={setToId}
      />
      <Form.TextField
        id="toName"
        title="Til stasjon navn"
        placeholder="Lillestrøm"
        value={toName}
        onChange={setToName}
      />
    </Form>
  );
}

export default function Command() {
  const [numTripPatterns] = useState(20);
  const [fromStopId, setFromStopId] = useState<string>(DEFAULT_FROM_ID);
  const [toStopId, setToStopId] = useState<string>(DEFAULT_TO_ID);
  const [fromStopName, setFromStopName] = useState<string>("Oslo S");
  const [toStopName, setToStopName] = useState<string>("Lillestrøm");
  const { push } = useNavigation();

  useEffect(() => {
    async function loadStops() {
      const from = await LocalStorage.getItem<string>("fromStop");
      const to = await LocalStorage.getItem<string>("toStop");
      const fromName = await LocalStorage.getItem<string>("fromStopName");
      const toName = await LocalStorage.getItem<string>("toStopName");

      if (from) setFromStopId(from);
      if (to) setToStopId(to);
      if (fromName) setFromStopName(fromName);
      if (toName) setToStopName(toName);
    }
    loadStops();
  }, []);

  async function swapStops() {
    const tempId = fromStopId;
    const tempName = fromStopName;

    setFromStopId(toStopId);
    setToStopId(tempId);
    setFromStopName(toStopName);
    setToStopName(tempName);

    await LocalStorage.setItem("fromStop", toStopId);
    await LocalStorage.setItem("toStop", tempId);
    await LocalStorage.setItem("fromStopName", toStopName);
    await LocalStorage.setItem("toStopName", tempName);

    await showToast({
      style: Toast.Style.Success,
      title: "Byttet retning",
      message: `${toStopName} → ${tempName}`,
    });
  }

  function updateStops(from: string, to: string, fromName: string, toName: string) {
    setFromStopId(from);
    setToStopId(to);
    setFromStopName(fromName);
    setToStopName(toName);
  }

  const { isLoading, data, error } = useFetch<TripResponse>("https://api.entur.io/journey-planner/v3/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ET-Client-Name": "raycast-entur-extension",
    },
    body: JSON.stringify({
      query: GRAPHQL_QUERY,
      variables: {
        from: fromStopId,
        to: toStopId,
        numTripPatterns,
      },
    }),
  });

  const tripPatterns = data?.data?.trip?.tripPatterns || [];

  return (
    <List isLoading={isLoading} navigationTitle={`Avganger fra ${fromStopName} til ${toStopName}`}>
      {error && (
        <List.EmptyView icon={Icon.XMarkCircle} title="Kunne ikke hente avganger" description={error.message} />
      )}
      {!error && tripPatterns.length === 0 && !isLoading && (
        <List.EmptyView
          icon={Icon.Calendar}
          title="Ingen avganger funnet"
          description="Prøv igjen senere"
          actions={
            <ActionPanel>
              <Action
                title="Bytt retning"
                icon={Icon.ArrowClockwise}
                onAction={swapStops}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
              />
              <Action
                title="Endre stasjoner"
                icon={Icon.Gear}
                onAction={() => push(<SetStopsForm onSubmit={updateStops} />)}
              />
            </ActionPanel>
          }
        />
      )}
      {tripPatterns.map((pattern, index) => {
        const transitLeg = pattern.legs.find((leg) => leg.line);
        if (!transitLeg || !transitLeg.fromEstimatedCall) return null;

        const departure = transitLeg.fromEstimatedCall;
        const arrival = transitLeg.toEstimatedCall;
        const departureTime = new Date(departure.expectedDepartureTime);
        const now = new Date();
        const waitingMin = Math.floor((departureTime.getTime() - now.getTime()) / 60000);

        const fullTime = departureTime.toLocaleTimeString("no-NO", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const delay = calculateDelay(departure.aimedDepartureTime, departure.expectedDepartureTime);

        const durationMin = Math.round(pattern.duration / 60);
        const lineName = transitLeg.line?.publicCode
          ? `${transitLeg.line.publicCode} ${transitLeg.line?.name?.split("-")[2]}`
          : "Ukjent linje";
        const toStation = arrival?.quay?.stopPlace?.name || arrival?.quay?.name || toStopName;
        const delaySubtitle = delay > 0 ? `Forsinket ${delay} min` : "";
        const platform = departure.quay?.publicCode || "";

        return (
          <List.Item
            key={`${pattern.startTime}-${index}`}
            icon={{
              source: getTransportIcon(transitLeg.mode),
              tintColor: getTransportColor(transitLeg.mode),
            }}
            title={lineName}
            subtitle={delaySubtitle}
            accessories={[
              { text: fullTime, tooltip: "Avgangstid" },
              ...(platform ? [{ text: `Spor ${platform}`, tooltip: "Plattform" }] : []),
              { text: `Om ${waitingMin} min`, tooltip: "Ventetid" },
            ]}
            actions={
              <ActionPanel>
                <Action
                  title="Bytt retning"
                  icon={Icon.ArrowClockwise}
                  onAction={swapStops}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                />
                <Action
                  title="Endre stasjoner"
                  icon={Icon.Gear}
                  onAction={() => push(<SetStopsForm onSubmit={updateStops} />)}
                />
                <Action.CopyToClipboard title="Kopier avgangstidspunkt" content={departure.expectedDepartureTime} />
                <Action.CopyToClipboard title="Kopier varighet" content={`${durationMin} minutter`} />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

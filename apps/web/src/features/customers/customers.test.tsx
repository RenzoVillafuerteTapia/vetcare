import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { admin, createFakeApi, json, problem, tokens, user } from "@/test/fake-api";
import { renderApp } from "@/test/render";

import { formatAge, type Client, type Pet } from "./labels";

function signedIn(currentUser = admin()) {
  return {
    "POST /api/v1/auth/refresh": () => tokens(),
    "GET /api/v1/auth/me": () => json(currentUser),
  };
}

const rosa: Client = {
  id: "0192f0a4-0000-7000-8000-00000000c001",
  full_name: "Rosa Quispe Mamani",
  document_type: "dni",
  document_number: "45678912",
  phone: "987654321",
  email: "rosa@example.test",
  address: "Av. Los Olivos 123",
  notes: null,
  has_account: false,
  created_at: "2026-11-01T15:00:00Z",
};

const luis: Client = {
  ...rosa,
  id: "0192f0a4-0000-7000-8000-00000000c002",
  full_name: "Luis Torres Vega",
  document_number: "40112233",
  phone: "912345678",
  email: null,
  address: null,
  has_account: false,
};

const luna: Pet = {
  id: "0192f0a4-0000-7000-8000-00000000e001",
  name: "Luna",
  species: "dog",
  sex: "female",
  breed: "Schnauzer",
  birth_date: "2021-03-15",
  birth_date_approximate: true,
  color: "Sal y pimienta",
  status: "active",
  allergies: "Pollo",
  notes: "Nerviosa con el secador.",
  photo_url: null,
  // El personal no la cambia desde aquí: es la vista del dueño en la app.
  can_change_photo: false,
  weights: [
    { kilograms: "7.20", measured_at: "2026-05-02T16:00:00Z" },
    { kilograms: "7.85", measured_at: "2026-10-20T16:00:00Z" },
  ],
  guardians: [
    {
      client_id: rosa.id,
      full_name: rosa.full_name,
      kind: "owner",
      permissions: { can_pickup: true, can_book: true, can_view_clinical: true },
    },
  ],
};

const page = (items: Client[], total = items.length, pageNumber = 1) =>
  json({ items, total, page: pageNumber, page_size: 20 });

describe("acceso a clientes", () => {
  it("sin pets:read no se ve ni se abre", async () => {
    renderApp("/clientes", createFakeApi(signedIn(user({ permissions: [] }))).fetch);

    expect(
      await screen.findByRole("heading", { name: "No tienes acceso a esta sección" }),
    ).toBeInTheDocument();
    const nav = screen.getAllByRole("navigation", { name: "Principal" })[0]!;
    expect(within(nav).queryByRole("link", { name: "Clientes" })).not.toBeInTheDocument();
  });

  it("quien solo consulta no ve las acciones de alta ni de edición", async () => {
    const api = createFakeApi({
      ...signedIn(user({ roles: ["assistant"], permissions: ["pets:read"] })),
      "GET /api/v1/clients": () => page([rosa]),
      [`GET /api/v1/pets/${luna.id}`]: () => json(luna),
    });
    const { router } = renderApp("/clientes", api.fetch);

    expect(await screen.findByText("Rosa Quispe Mamani")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuevo cliente" })).not.toBeInTheDocument();

    await router.navigate(`/mascotas/${luna.id}`);
    expect(await screen.findByRole("heading", { name: "Luna" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar perfil" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar peso" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar responsable" })).not.toBeInTheDocument();
  });
});

describe("listado de clientes", () => {
  it("busca al dejar de escribir y avisa si no hay resultados", async () => {
    const api = createFakeApi({
      ...signedIn(),
      "GET /api/v1/clients": (request) =>
        new URL(request.url).searchParams.get("q") === "zzz" ? page([]) : page([rosa, luis]),
    });
    renderApp("/clientes", api.fetch);

    expect(await screen.findByText("Rosa Quispe Mamani")).toBeInTheDocument();
    // Tarjeta: documento, teléfono destacado y correo.
    expect(screen.getByText("DNI 45678912")).toBeInTheDocument();
    expect(screen.getByText("987654321")).toBeInTheDocument();
    expect(screen.getByText("rosa@example.test")).toBeInTheDocument();
    expect(screen.getByText("2 clientes")).toBeInTheDocument();

    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar clientes" }), "zzz");

    expect(await screen.findByRole("heading", { name: "Sin resultados" })).toBeInTheDocument();
    const searches = api.calls("GET /api/v1/clients").map((r) => new URL(r.url).searchParams);
    // Una consulta inicial y una sola búsqueda, no una por tecla.
    expect(searches.map((params) => params.get("q"))).toEqual([null, "zzz"]);
  });

  it("pagina los resultados", async () => {
    const api = createFakeApi({
      ...signedIn(),
      "GET /api/v1/clients": (request) =>
        new URL(request.url).searchParams.get("page") === "2"
          ? page([luis], 30, 2)
          : page([rosa], 30, 1),
    });
    renderApp("/clientes", api.fetch);

    expect(await screen.findByText("30 clientes · página 1 de 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(await screen.findByText("Luis Torres Vega")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });

  it("muestra el error de la API", async () => {
    renderApp(
      "/clientes",
      createFakeApi({
        ...signedIn(),
        "GET /api/v1/clients": () =>
          problem(403, "permission_denied", "No tienes permiso para realizar esta operación."),
      }).fetch,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No tienes permiso para realizar esta operación.",
    );
  });
});

describe("alta y edición de clientes", () => {
  it("valida el DNI, marca el documento repetido y abre la ficha al registrar", async () => {
    const responses = [
      problem(409, "document_taken", "Ya hay un cliente con ese documento."),
      json(luis, 201),
    ];
    const api = createFakeApi({
      ...signedIn(),
      "GET /api/v1/clients": () => page([]),
      "POST /api/v1/clients": () => responses.shift()!,
      [`GET /api/v1/clients/${luis.id}`]: () => json(luis),
      [`GET /api/v1/clients/${luis.id}/pets`]: () => json([]),
    });
    const { router } = renderApp("/clientes", api.fetch);

    expect(
      await screen.findByRole("heading", { name: "Todavía no hay clientes" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuevo cliente" });
    await userEvent.type(within(dialog).getByLabelText("Nombre completo"), "Luis Torres Vega");
    await userEvent.type(within(dialog).getByLabelText("Número de documento"), "4011223");
    await userEvent.type(within(dialog).getByLabelText("Teléfono"), "912345678");
    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar cliente" }));

    expect(await within(dialog).findByText("El DNI tiene 8 dígitos.")).toBeInTheDocument();
    expect(api.calls("POST /api/v1/clients")).toHaveLength(0);

    await userEvent.type(within(dialog).getByLabelText("Número de documento"), "3");
    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar cliente" }));
    expect(
      await within(dialog).findByText("Ya hay un cliente con ese documento."),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Número de documento")).toHaveAttribute(
      "aria-invalid",
      "true",
    );

    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar cliente" }));
    expect(await screen.findByRole("heading", { name: "Luis Torres Vega" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/clientes/${luis.id}`);
    expect(await api.calls("POST /api/v1/clients")[1]?.json()).toEqual({
      full_name: "Luis Torres Vega",
      document_type: "dni",
      document_number: "40112233",
      phone: "912345678",
      email: null,
      address: null,
      notes: null,
    });
  });

  it("edita desde la ficha y muestra junto al correo que lo fija la cuenta", async () => {
    const api = createFakeApi({
      ...signedIn(),
      [`GET /api/v1/clients/${rosa.id}`]: () => json({ ...rosa, has_account: true }),
      [`GET /api/v1/clients/${rosa.id}/pets`]: () => json([]),
      [`PUT /api/v1/clients/${rosa.id}`]: () =>
        problem(
          409,
          "email_locked_by_account",
          "El cliente ya tiene cuenta: su correo se cambia desde la cuenta.",
        ),
    });
    renderApp(`/clientes/${rosa.id}`, api.fetch);

    await userEvent.click(await screen.findByRole("button", { name: "Editar cliente" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar cliente" });
    expect(within(dialog).getByLabelText("Dirección (opcional)")).toHaveValue("Av. Los Olivos 123");
    await userEvent.clear(within(dialog).getByLabelText("Correo (opcional)"));
    await userEvent.type(within(dialog).getByLabelText("Correo (opcional)"), "otra@example.test");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));

    expect(
      await within(dialog).findByText(
        "El cliente ya tiene cuenta: su correo se cambia desde la cuenta.",
      ),
    ).toBeInTheDocument();
    expect(await api.calls(`PUT /api/v1/clients/${rosa.id}`)[0]?.json()).toMatchObject({
      full_name: "Rosa Quispe Mamani",
      email: "otra@example.test",
      notes: null,
    });
  });
});

describe("ficha del cliente", () => {
  it("muestra sus datos y sus mascotas, e invita a la app", async () => {
    const api = createFakeApi({
      ...signedIn(),
      [`GET /api/v1/clients/${rosa.id}`]: () => json(rosa),
      [`GET /api/v1/clients/${rosa.id}/pets`]: () => json([luna]),
      [`POST /api/v1/clients/${rosa.id}/invitation`]: () => json({ ...rosa, has_account: true }),
    });
    renderApp(`/clientes/${rosa.id}`, api.fetch);

    expect(await screen.findByRole("heading", { name: "Rosa Quispe Mamani" })).toBeInTheDocument();
    expect(screen.getByText("Av. Los Olivos 123")).toBeInTheDocument();
    const pets = await screen.findByRole("list", { name: "Mascotas del cliente" });
    const item = within(pets).getByRole("link", { name: /Luna/ });
    expect(item).toHaveAttribute("href", `/mascotas/${luna.id}`);
    expect(item).toHaveTextContent("Perro · Schnauzer");
    expect(item).toHaveTextContent("Dueño");

    await userEvent.click(screen.getByRole("button", { name: "Invitar a la app" }));

    expect(await screen.findByText("Invitación enviada a rosa@example.test")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invitar a la app" })).not.toBeInTheDocument();
    expect(api.calls(`POST /api/v1/clients/${rosa.id}/invitation`)).toHaveLength(1);
  });

  it("sin correo no se puede invitar", async () => {
    renderApp(
      `/clientes/${luis.id}`,
      createFakeApi({
        ...signedIn(),
        [`GET /api/v1/clients/${luis.id}`]: () => json(luis),
        [`GET /api/v1/clients/${luis.id}/pets`]: () => json([]),
      }).fetch,
    );

    expect(
      await screen.findByText("Registra su correo para poder invitarlo a la app."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invitar a la app" })).toBeDisabled();
    expect(
      await screen.findByRole("heading", { name: "Sin mascotas registradas" }),
    ).toBeInTheDocument();
  });

  it("registra una mascota con el cliente como dueño y abre su perfil", async () => {
    const api = createFakeApi({
      ...signedIn(),
      [`GET /api/v1/clients/${rosa.id}`]: () => json(rosa),
      [`GET /api/v1/clients/${rosa.id}/pets`]: () => json([]),
      [`POST /api/v1/clients/${rosa.id}/pets`]: () => json(luna, 201),
      [`GET /api/v1/pets/${luna.id}`]: () => json(luna),
    });
    const { router } = renderApp(`/clientes/${rosa.id}`, api.fetch);

    await userEvent.click(await screen.findByRole("button", { name: "Nueva mascota" }));
    const dialog = await screen.findByRole("dialog", { name: "Nueva mascota" });
    expect(dialog).toHaveTextContent("Rosa Quispe Mamani quedará como su dueño.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar mascota" }));
    expect(await within(dialog).findByText("Ingresa el nombre de la mascota.")).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText("Nombre"), "Luna");
    await userEvent.selectOptions(within(dialog).getByLabelText("Sexo"), "female");
    await userEvent.type(within(dialog).getByLabelText("Raza (opcional)"), "Schnauzer");
    fireEvent.change(within(dialog).getByLabelText("Fecha de nacimiento (opcional)"), {
      target: { value: "2021-03-15" },
    });
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "La fecha es aproximada" }));
    await userEvent.type(within(dialog).getByLabelText("Alergias (opcional)"), "Pollo");
    await userEvent.click(within(dialog).getByRole("button", { name: "Registrar mascota" }));

    expect(await screen.findByRole("heading", { name: "Luna" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/mascotas/${luna.id}`);
    expect(await api.calls(`POST /api/v1/clients/${rosa.id}/pets`)[0]?.json()).toEqual({
      name: "Luna",
      species: "dog",
      sex: "female",
      breed: "Schnauzer",
      birth_date: "2021-03-15",
      birth_date_approximate: true,
      color: null,
      allergies: "Pollo",
      notes: null,
    });
  });
});

describe("perfil de la mascota", () => {
  const petRoutes = (overrides: Record<string, (request: Request) => Response> = {}) => ({
    ...signedIn(),
    [`GET /api/v1/pets/${luna.id}`]: () => json(luna),
    ...overrides,
  });

  it("muestra el perfil, el peso más reciente primero y los responsables", async () => {
    renderApp(`/mascotas/${luna.id}`, createFakeApi(petRoutes()).fetch);

    expect(await screen.findByRole("heading", { name: "Luna" })).toBeInTheDocument();
    expect(screen.getByText("Perro · Schnauzer · Hembra")).toBeInTheDocument();
    expect(screen.getByText(/15 de marzo de 2021 \(aproximada\)/)).toBeInTheDocument();
    expect(screen.getByText("Nerviosa con el secador.")).toBeInTheDocument();

    const weights = within(screen.getByRole("list", { name: "Historial de peso" }));
    expect(weights.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      expect.stringContaining("7.85 kg"),
      expect.stringContaining("7.2 kg"),
    ]);

    const guardians = within(screen.getByRole("list", { name: "Dueños y responsables" }));
    expect(guardians.getByRole("link", { name: "Rosa Quispe Mamani" })).toHaveAttribute(
      "href",
      `/clientes/${rosa.id}`,
    );
    expect(guardians.getByText("Todos los permisos")).toBeInTheDocument();
  });

  it("edita el perfil enviando los opcionales vacíos como null", async () => {
    const api = createFakeApi(
      petRoutes({ [`PUT /api/v1/pets/${luna.id}`]: () => json({ ...luna, color: null }) }),
    );
    renderApp(`/mascotas/${luna.id}`, api.fetch);

    await userEvent.click(await screen.findByRole("button", { name: "Editar perfil" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar a Luna" });
    await userEvent.clear(within(dialog).getByLabelText("Color (opcional)"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await api.calls(`PUT /api/v1/pets/${luna.id}`)[0]?.json()).toEqual({
      name: "Luna",
      species: "dog",
      sex: "female",
      breed: "Schnauzer",
      birth_date: "2021-03-15",
      birth_date_approximate: true,
      color: null,
      allergies: "Pollo",
      notes: "Nerviosa con el secador.",
    });
  });

  it("registra un peso y cambia el estado", async () => {
    const heavier: Pet = {
      ...luna,
      weights: [...luna.weights, { kilograms: "8.10", measured_at: "2026-11-10T16:00:00Z" }],
    };
    // La API simulada recuerda el último estado, como la real al volver a consultar.
    let current: Pet = luna;
    const reply = (next: Pet, status = 200) => json((current = next), status);
    const api = createFakeApi(
      petRoutes({
        [`GET /api/v1/pets/${luna.id}`]: () => json(current),
        [`POST /api/v1/pets/${luna.id}/weights`]: () => reply(heavier, 201),
        [`PATCH /api/v1/pets/${luna.id}/status`]: () => reply({ ...heavier, status: "deceased" }),
      }),
    );
    renderApp(`/mascotas/${luna.id}`, api.fetch);

    await userEvent.click(await screen.findByRole("button", { name: "Registrar peso" }));
    expect(await screen.findByText("Ingresa el peso en kilos.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Nuevo peso (kg)"), "8.1");
    await userEvent.click(screen.getByRole("button", { name: "Registrar peso" }));

    expect(await screen.findByText("8.1 kg")).toBeInTheDocument();
    expect(await api.calls(`POST /api/v1/pets/${luna.id}/weights`)[0]?.json()).toEqual({
      kilograms: 8.1,
    });
    expect(screen.getByLabelText("Nuevo peso (kg)")).toHaveValue(null);

    await userEvent.selectOptions(screen.getByLabelText("Estado"), "deceased");
    expect(await screen.findByText("Fallecida", { selector: "span" })).toBeInTheDocument();
    expect(await api.calls(`PATCH /api/v1/pets/${luna.id}/status`)[0]?.json()).toEqual({
      status: "deceased",
    });
  });

  it("agrega un responsable buscándolo entre los clientes", async () => {
    const withLuis: Pet = {
      ...luna,
      guardians: [
        ...luna.guardians,
        {
          client_id: luis.id,
          full_name: luis.full_name,
          kind: "authorized",
          permissions: { can_pickup: true, can_book: true, can_view_clinical: false },
        },
      ],
    };
    const api = createFakeApi(
      petRoutes({
        "GET /api/v1/clients": () => page([rosa, luis]),
        [`POST /api/v1/pets/${luna.id}/guardians`]: () => json(withLuis, 201),
      }),
    );
    renderApp(`/mascotas/${luna.id}`, api.fetch);

    await userEvent.click(await screen.findByRole("button", { name: "Agregar responsable" }));
    const dialog = await screen.findByRole("dialog", { name: "Agregar responsable de Luna" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Agregar responsable" }));
    expect(
      await within(dialog).findByText("Elige al cliente que será responsable."),
    ).toBeInTheDocument();

    await userEvent.type(within(dialog).getByRole("searchbox", { name: "Buscar cliente" }), "to");
    // Quien ya es responsable no se ofrece otra vez.
    await userEvent.click(await within(dialog).findByRole("radio", { name: /Luis Torres Vega/ }));
    expect(within(dialog).queryByRole("radio", { name: /Rosa Quispe/ })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Reservar citas" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Agregar responsable" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await api.calls(`POST /api/v1/pets/${luna.id}/guardians`)[0]?.json()).toEqual({
      client_id: luis.id,
      kind: "authorized",
      permissions: { can_pickup: true, can_book: true, can_view_clinical: false },
    });
    expect(
      await screen.findByText("Puede recoger a la mascota, reservar citas"),
    ).toBeInTheDocument();
  });

  it("convierte a un responsable en dueño y avisa si se quita al último dueño", async () => {
    const guardianUrl = `/api/v1/pets/${luna.id}/guardians/${rosa.id}`;
    const api = createFakeApi(
      petRoutes({
        [`PUT ${guardianUrl}`]: () => json(luna),
        [`DELETE ${guardianUrl}`]: () =>
          problem(409, "last_owner", "La mascota debe tener al menos un dueño."),
      }),
    );
    renderApp(`/mascotas/${luna.id}`, api.fetch);

    await userEvent.click(
      await screen.findByRole("button", { name: "Cambiar los permisos de Rosa Quispe Mamani" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Permisos de Rosa Quispe Mamani" });
    expect(within(dialog).getByRole("checkbox", { name: "Reservar citas" })).toBeDisabled();
    await userEvent.selectOptions(within(dialog).getByLabelText("Tipo"), "authorized");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Reservar citas" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar permisos" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await api.calls(`PUT ${guardianUrl}`)[0]?.json()).toEqual({
      kind: "authorized",
      permissions: { can_pickup: true, can_book: false, can_view_clinical: true },
    });

    await userEvent.click(screen.getByRole("button", { name: "Quitar a Rosa Quispe Mamani" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La mascota debe tener al menos un dueño.",
    );
  });
});

describe("foto de la mascota", () => {
  const photoUrl = (file: string) =>
    `http://localhost:8000/api/v1/files/pets/${luna.id}/${file}?expires=1&signature=abc`;
  const withPhoto: Pet = { ...luna, photo_url: photoUrl("foto-1.jpg") };
  const jpg = (name = "luna.jpg", bytes = 1024) =>
    new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });

  it("sube la foto como formulario y la muestra", async () => {
    let current: Pet = luna;
    let received: FormData | undefined;
    const api = createFakeApi({
      ...signedIn(),
      [`GET /api/v1/pets/${luna.id}`]: () => json(current),
      [`PUT /api/v1/pets/${luna.id}/photo`]: async (request) => {
        received = await request.formData();
        return json((current = withPhoto));
      },
    });
    renderApp(`/mascotas/${luna.id}`, api.fetch);

    expect(await screen.findByRole("button", { name: "Subir foto" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Foto de Luna" })).not.toBeInTheDocument();

    await userEvent.upload(screen.getByLabelText("Archivo de la foto"), jpg());

    expect(await screen.findByRole("img", { name: "Foto de Luna" })).toHaveAttribute(
      "src",
      withPhoto.photo_url,
    );
    expect(received?.get("file")).toMatchObject({ size: 1024, type: "image/jpeg" });
    expect(screen.getByRole("button", { name: "Cambiar foto" })).toBeInTheDocument();
  });

  it("rechaza en el navegador lo que no es imagen o pesa más de 5 MB", async () => {
    const api = createFakeApi({
      ...signedIn(),
      [`GET /api/v1/pets/${luna.id}`]: () => json(luna),
    });
    renderApp(`/mascotas/${luna.id}`, api.fetch);
    const input = await screen.findByLabelText("Archivo de la foto");

    fireEvent.change(input, {
      target: { files: [new File(["%PDF"], "receta.pdf", { type: "application/pdf" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Usa una imagen JPG, PNG o WebP.");

    fireEvent.change(input, { target: { files: [jpg("grande.jpg", 5 * 1024 * 1024 + 1)] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("La imagen pesa más de 5 MB.");

    expect(api.calls(`PUT /api/v1/pets/${luna.id}/photo`)).toHaveLength(0);
  });

  it("muestra el motivo si la API rechaza el archivo", async () => {
    const api = createFakeApi({
      ...signedIn(),
      [`GET /api/v1/pets/${luna.id}`]: () => json(luna),
      [`PUT /api/v1/pets/${luna.id}/photo`]: () =>
        problem(422, "validation_failed", "Usa una imagen JPG, PNG o WebP.", [
          { field: "file", message: "Usa una imagen JPG, PNG o WebP." },
        ]),
    });
    renderApp(`/mascotas/${luna.id}`, api.fetch);

    // Un PDF renombrado pasa la revisión del navegador; la API mira el contenido.
    await userEvent.upload(await screen.findByLabelText("Archivo de la foto"), jpg("receta.jpg"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Usa una imagen JPG, PNG o WebP.");
    expect(screen.getByRole("button", { name: "Subir foto" })).toBeEnabled();
  });

  it("quita la foto", async () => {
    let current: Pet = withPhoto;
    const api = createFakeApi({
      ...signedIn(),
      [`GET /api/v1/pets/${luna.id}`]: () => json(current),
      [`DELETE /api/v1/pets/${luna.id}/photo`]: () => json((current = luna)),
    });
    renderApp(`/mascotas/${luna.id}`, api.fetch);

    expect(await screen.findByRole("img", { name: "Foto de Luna" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Quitar foto" }));

    await waitFor(() =>
      expect(screen.queryByRole("img", { name: "Foto de Luna" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Subir foto" })).toBeInTheDocument();
  });

  it("si la URL firmada venció, pide una nueva una sola vez", async () => {
    let served = 0;
    const api = createFakeApi({
      ...signedIn(),
      [`GET /api/v1/pets/${luna.id}`]: () =>
        json({ ...luna, photo_url: `${photoUrl("foto-1.jpg")}&n=${++served}` }),
    });
    renderApp(`/mascotas/${luna.id}`, api.fetch);

    const expired = await screen.findByRole("img", { name: "Foto de Luna" });
    expect(expired.getAttribute("src")).toContain("n=1");
    fireEvent.error(expired);

    const renewed = await screen.findByRole("img", { name: "Foto de Luna" });
    await waitFor(() => expect(renewed.getAttribute("src")).toContain("n=2"));

    // Si la nueva tampoco carga (el archivo ya no existe), queda la huella y no insiste.
    fireEvent.error(screen.getByRole("img", { name: "Foto de Luna" }));
    await waitFor(() =>
      expect(screen.queryByRole("img", { name: "Foto de Luna" })).not.toBeInTheDocument(),
    );
    expect(api.calls(`GET /api/v1/pets/${luna.id}`)).toHaveLength(2);
  });

  it("quien solo consulta ve la foto sin acciones, también en la ficha del cliente", async () => {
    const api = createFakeApi({
      ...signedIn(user({ roles: ["assistant"], permissions: ["pets:read"] })),
      [`GET /api/v1/pets/${luna.id}`]: () => json(withPhoto),
      [`GET /api/v1/clients/${rosa.id}`]: () => json(rosa),
      [`GET /api/v1/clients/${rosa.id}/pets`]: () => json([withPhoto]),
    });
    const { router } = renderApp(`/mascotas/${luna.id}`, api.fetch);

    expect(await screen.findByRole("img", { name: "Foto de Luna" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cambiar foto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar foto" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Archivo de la foto")).not.toBeInTheDocument();

    await router.navigate(`/clientes/${rosa.id}`);
    const pets = within(await screen.findByRole("list", { name: "Mascotas del cliente" }));
    expect(pets.getByRole("img", { name: "Foto de Luna" })).toBeInTheDocument();
  });
});

describe("edad", () => {
  const today = new Date(2026, 10, 11);

  it("se expresa en meses, en años o en ambos", () => {
    expect(formatAge("2026-11-01", today)).toBe("menos de 1 mes");
    expect(formatAge("2026-06-11", today)).toBe("5 meses");
    expect(formatAge("2025-09-20", today)).toBe("1 año y 1 mes");
    expect(formatAge("2025-11-11", today)).toBe("1 año");
    expect(formatAge("2021-03-15", today)).toBe("5 años");
  });
});

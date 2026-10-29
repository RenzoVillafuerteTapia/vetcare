import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { admin, createFakeApi, empty, json, problem, tokens, user } from "@/test/fake-api";
import { renderApp } from "@/test/render";

const anonymous = { "POST /api/v1/auth/refresh": () => problem(401, "not_authenticated") };

function signedIn(currentUser = user()) {
  return {
    "POST /api/v1/auth/refresh": () => tokens(),
    "GET /api/v1/auth/me": () => json(currentUser),
    "POST /api/v1/auth/logout": () => empty(),
  };
}

describe("acceso", () => {
  it("sin sesión, una ruta privada lleva al login", async () => {
    const { router } = renderApp("/", createFakeApi(anonymous).fetch);

    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("valida el formulario en español antes de llamar a la API", async () => {
    const api = createFakeApi(anonymous);
    renderApp("/login", api.fetch);

    await userEvent.click(await screen.findByRole("button", { name: "Ingresar" }));

    expect(await screen.findByText("Ingresa tu correo.")).toBeInTheDocument();
    expect(screen.getByText("Ingresa tu contraseña.")).toBeInTheDocument();
    expect(screen.getByLabelText("Correo")).toHaveAttribute("aria-invalid", "true");
    expect(api.calls("POST /api/v1/auth/login")).toHaveLength(0);
  });

  it("muestra el mensaje de la API si las credenciales fallan", async () => {
    renderApp(
      "/login",
      createFakeApi({
        ...anonymous,
        "POST /api/v1/auth/login": () =>
          problem(401, "not_authenticated", "Correo o contraseña incorrectos."),
      }).fetch,
    );

    await userEvent.type(await screen.findByLabelText("Correo"), "ana@example.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "equivocada");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos.");
  });

  it("al ingresar vuelve a la ruta que se pidió", async () => {
    const api = createFakeApi({
      ...anonymous,
      "POST /api/v1/auth/login": () => tokens(),
      "GET /api/v1/auth/me": () => json(admin()),
    });
    const { router } = renderApp("/usuarios/invitar", api.fetch);

    await userEvent.type(await screen.findByLabelText("Correo"), "admin@example.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "una frase larga");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("heading", { name: "Invitar usuario" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/usuarios/invitar");
  });

  it("solo quien gestiona usuarios ve y abre la invitación", async () => {
    renderApp("/usuarios/invitar", createFakeApi(signedIn(user())).fetch);

    expect(
      await screen.findByRole("heading", { name: "No tienes acceso a esta sección" }),
    ).toBeInTheDocument();
    const nav = screen.getAllByRole("navigation", { name: "Principal" })[0]!;
    expect(within(nav).queryByRole("link", { name: "Invitar usuario" })).not.toBeInTheDocument();
  });

  it("cerrar sesión vuelve al login", async () => {
    const api = createFakeApi(signedIn(admin()));
    const { router } = renderApp("/", api.fetch);

    await userEvent.click(await screen.findByRole("button", { name: "Salir" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(api.calls("POST /api/v1/auth/logout")).toHaveLength(1);
  });
});

describe("activación de cuenta", () => {
  it("sin token en el enlace explica qué hacer", async () => {
    renderApp("/activar-cuenta", createFakeApi(anonymous).fetch);

    expect(await screen.findByRole("alert")).toHaveTextContent("El enlace está incompleto");
  });

  it("muestra los errores de contraseña que devuelve la API", async () => {
    renderApp(
      "/activar-cuenta#token=token-de-prueba-123",
      createFakeApi({
        ...anonymous,
        "POST /api/v1/auth/invitations/accept": () =>
          problem(422, "validation_failed", "La contraseña no cumple los requisitos.", [
            { field: "password", message: "No debe contener tu correo." },
          ]),
      }).fetch,
    );

    await userEvent.type(await screen.findByLabelText("Contraseña"), "ana-perez-2026-larga");
    await userEvent.type(screen.getByLabelText("Repite la contraseña"), "ana-perez-2026-larga");
    await userEvent.click(screen.getByRole("button", { name: "Activar cuenta" }));

    expect(await screen.findByText("No debe contener tu correo.")).toBeInTheDocument();
  });

  it("envía el token del enlace y confirma la activación", async () => {
    const api = createFakeApi({
      ...anonymous,
      "POST /api/v1/auth/invitations/accept": () => empty(),
    });
    renderApp("/activar-cuenta#token=token-de-prueba-123", api.fetch);

    await userEvent.type(await screen.findByLabelText("Contraseña"), "un gato en la ventana");
    await userEvent.type(screen.getByLabelText("Repite la contraseña"), "un gato en la ventanA");
    await userEvent.click(screen.getByRole("button", { name: "Activar cuenta" }));
    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Repite la contraseña"));
    await userEvent.type(screen.getByLabelText("Repite la contraseña"), "un gato en la ventana");
    await userEvent.click(screen.getByRole("button", { name: "Activar cuenta" }));

    expect(await screen.findByText(/Tu cuenta está activa/)).toBeInTheDocument();
    expect(await api.calls("POST /api/v1/auth/invitations/accept")[0]?.json()).toEqual({
      token: "token-de-prueba-123",
      password: "un gato en la ventana",
    });
  });
});

describe("invitar usuario", () => {
  it("no permite mezclar el rol cliente con roles del personal", async () => {
    const api = createFakeApi(signedIn(admin()));
    renderApp("/usuarios/invitar", api.fetch);

    await userEvent.type(await screen.findByLabelText("Correo"), "x@example.test");
    await userEvent.type(screen.getByLabelText("Nombre completo"), "Equis Ye");
    await userEvent.click(screen.getByRole("checkbox", { name: /^Cliente/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Recepción/ }));
    await userEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));

    expect(
      await screen.findByText("Una cuenta de cliente no puede tener roles del personal."),
    ).toBeInTheDocument();
    expect(api.calls("POST /api/v1/users")).toHaveLength(0);
  });

  it("invita, confirma el envío y permite reenviar", async () => {
    const invited = {
      id: "0192f0a4-0000-7000-8000-000000000099",
      email: "vet@example.test",
      full_name: "Dra. Rosa Díaz",
      roles: ["veterinarian"],
      status: "invited",
    };
    const api = createFakeApi({
      ...signedIn(admin()),
      "POST /api/v1/users": () => json(invited, 201),
      [`POST /api/v1/users/${invited.id}/invitation`]: () => empty(202),
    });
    renderApp("/usuarios/invitar", api.fetch);

    await userEvent.type(await screen.findByLabelText("Correo"), "vet@example.test");
    await userEvent.type(screen.getByLabelText("Nombre completo"), "Dra. Rosa Díaz");
    await userEvent.click(screen.getByRole("checkbox", { name: /Veterinaria/ }));
    await userEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));

    expect(await screen.findByText("Invitación enviada a vet@example.test")).toBeInTheDocument();
    expect(await api.calls("POST /api/v1/users")[0]?.json()).toEqual({
      email: "vet@example.test",
      full_name: "Dra. Rosa Díaz",
      roles: ["veterinarian"],
    });
    expect(screen.getByLabelText("Correo")).toHaveValue("");

    await userEvent.click(screen.getByRole("button", { name: "Reenviar invitación" }));
    expect(await screen.findByText(/el anterior dejó de valer/)).toBeInTheDocument();
  });

  it("marca el correo si ya tiene una cuenta", async () => {
    renderApp(
      "/usuarios/invitar",
      createFakeApi({
        ...signedIn(admin()),
        "POST /api/v1/users": () =>
          problem(409, "email_taken", "Ya existe una cuenta con ese correo."),
      }).fetch,
    );

    await userEvent.type(await screen.findByLabelText("Correo"), "ana@example.test");
    await userEvent.type(screen.getByLabelText("Nombre completo"), "Ana Pérez");
    await userEvent.click(screen.getByRole("checkbox", { name: /Recepción/ }));
    await userEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));

    expect(await screen.findByText("Ya existe una cuenta con ese correo.")).toBeInTheDocument();
    expect(screen.getByLabelText("Correo")).toHaveAttribute("aria-invalid", "true");
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Login } from "../Login";
import type { LoginController } from "../hooks/use-login.hooks";

/**
 * @file `Login` — markup only. Every state is driven through the injectable `useLoginHook` prop
 * (see `Posts.tsx`'s own doc for the convention), never a fake `fetch`.
 */

function stubHook(overrides: Partial<LoginController> = {}): () => LoginController {
  return () => ({
    username: "admin",
    setUsername: vi.fn(),
    password: "",
    setPassword: vi.fn(),
    error: null,
    busy: false,
    submit: vi.fn((e) => {
      e.preventDefault();
      return Promise.resolve();
    }),
    ...overrides,
  });
}

describe("Login", () => {
  it("passes the onLogin prop straight through to useLoginHook, unmodified", () => {
    const onLogin = vi.fn();
    const useLoginHook = vi.fn(stubHook());
    render(<Login onLogin={onLogin} useLoginHook={useLoginHook} />);
    expect(useLoginHook).toHaveBeenCalledWith({ onLogin });
  });

  it("renders the hook's username/password values in their inputs", () => {
    render(<Login onLogin={vi.fn()} useLoginHook={stubHook({ username: "alice", password: "secret" })} />);
    expect(screen.getByLabelText(/username/i)).toHaveValue("alice");
    expect(screen.getByLabelText(/password/i)).toHaveValue("secret");
  });

  it("calls the hook's setUsername/setPassword as the operator types", async () => {
    const user = userEvent.setup();
    const setUsername = vi.fn();
    const setPassword = vi.fn();
    render(<Login onLogin={vi.fn()} useLoginHook={stubHook({ username: "", password: "", setUsername, setPassword })} />);

    await user.type(screen.getByLabelText(/username/i), "x");
    await user.type(screen.getByLabelText(/password/i), "y");

    expect(setUsername).toHaveBeenCalledWith("x");
    expect(setPassword).toHaveBeenCalledWith("y");
  });

  it("shows no error banner when error is null", () => {
    render(<Login onLogin={vi.fn()} useLoginHook={stubHook({ error: null })} />);
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });

  it("shows the hook's error message verbatim when set", () => {
    render(<Login onLogin={vi.fn()} useLoginHook={stubHook({ error: "invalid credentials" })} />);
    expect(screen.getByText("invalid credentials")).toBeInTheDocument();
  });

  it("disables the submit button and shows 'Signing in…' while busy", () => {
    render(<Login onLogin={vi.fn()} useLoginHook={stubHook({ busy: true })} />);
    const button = screen.getByRole("button", { name: /signing in/i });
    expect(button).toBeDisabled();
  });

  it("enables the submit button and shows 'Sign in' when not busy", () => {
    render(<Login onLogin={vi.fn()} useLoginHook={stubHook({ busy: false })} />);
    const button = screen.getByRole("button", { name: /^sign in$/i });
    expect(button).toBeEnabled();
  });

  it("calls the hook's submit when the form is submitted", async () => {
    const user = userEvent.setup();
    // `async`, because `LoginController.submit` is `(e) => Promise<void>` and `preventDefault`
    // returns `void` — the bare arrow does not satisfy the controller's type.
    const submit = vi.fn(async (e: React.FormEvent) => {
      e.preventDefault();
    });
    render(<Login onLogin={vi.fn()} useLoginHook={stubHook({ submit })} />);

    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(submit).toHaveBeenCalledOnce();
  });
});

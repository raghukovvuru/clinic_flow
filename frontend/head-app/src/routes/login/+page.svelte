<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { getLoginBoot } from "$lib/boot/login-boot";
  import { clinicLogin, clinicLogout } from "$lib/api/login-client";
  import type { LoginBoot, LoginError } from "$login/types";

  let boot: LoginBoot | null = null;
  let usr = "";
  let pwd = "";
  let error: LoginError | null = null;
  let pending = false;
  let showForgot = false;
  let showPassword = false;

  let emailInput: HTMLInputElement | undefined;
  let signOutButton: HTMLButtonElement | undefined;

  if (browser) {
    boot = getLoginBoot();
  }

  async function handleLogin(event: Event) {
    event.preventDefault();
    if (pending) return;
    if (!usr.trim() || !pwd.trim()) return;
    pending = true;
    error = null;
    try {
      const result = await clinicLogin(usr, pwd);
      if (result.success && result.redirectUrl) {
        window.location.href = result.redirectUrl;
      } else if (result.error) {
        error = result.error;
        if (result.error.type === "password_reset_required") {
          showForgot = true;
        }
      }
    } finally {
      pending = false;
    }
  }

  async function handleSignOut() {
    await clinicLogout();
    const target = boot?.redirectUrl || "/clinic/arrival-counter";
    const query = encodeURIComponent(target);
    window.location.href = `/clinic/login?redirect-to=${query}`;
  }

  function openForgot() {
    showForgot = true;
  }

  function closeForgot() {
    showForgot = false;
  }

  onMount(() => {
    if (!boot) boot = getLoginBoot();
    if (boot.mode === "login") {
      emailInput?.focus();
    } else {
      signOutButton?.focus();
    }
  });
</script>

<svelte:head>
  <title>Clinic Flow</title>
</svelte:head>

<div class="login-page">
  <div class="login-card">
    {#if boot?.mode === "access-denied"}
      <div class="access-denied">
        <h1>Clinic Flow</h1>
        <p class="subtitle">You are signed in as {boot?.currentUser}</p>
        <p class="required-roles">
          This application requires one of the following roles: {boot?.requiredRoles.join(", ")}
        </p>
        <button class="btn btn-signout" on:click={handleSignOut} bind:this={signOutButton}>
          Sign out and use a different account
        </button>
      </div>
    {:else}
      <div class="login-form">
        <h1>Clinic Flow</h1>
        <p class="subtitle">Sign in to continue</p>

        {#if showForgot}
          <section class="forgot-panel" aria-live="polite">
            <h2>Reset your password</h2>
            <p>Use Frappe password reset in a new tab, then return here to sign in.</p>
            <a href="/login#forgot" target="_blank" rel="noopener noreferrer">Open password reset</a>
            <button type="button" class="btn btn-secondary" on:click={closeForgot}>Back to sign in</button>
          </section>
        {:else}
        <form on:submit={handleLogin}>
          <div class="field">
            <label for="usr">Email or Username</label>
            <input
              id="usr"
              type="text"
              bind:value={usr}
              bind:this={emailInput}
              autocomplete="username"
              disabled={pending}
              required
            />
          </div>

          <div class="field">
            <label for="pwd">Password</label>
            <div class="password-row">
              <input
                id="pwd"
                type={showPassword ? "text" : "password"}
                bind:value={pwd}
                autocomplete="current-password"
                disabled={pending}
                required
              />
              <button
                type="button"
                class="pwd-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                on:click={() => (showPassword = !showPassword)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {#if error}
            <div class="error-banner" role="alert">{error.message}</div>
          {/if}

          <button class="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <button type="button" class="forgot-link" on:click={openForgot}>Forgot password?</button>
        {/if}
      </div>
    {/if}

    <div class="slice-divider" role="separator" aria-label="or go to">or go to</div>
    <nav class="slice-nav" aria-label="Clinic slice navigation">
      <a href="/clinic/arrival-counter" class="slice-card">
        <span class="slice-card-title">Arrival Counter</span>
        <span class="slice-card-subtitle">Go to check-in and queue intake</span>
      </a>
    </nav>
  </div>
</div>

<style>
  .login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    background: #f6f5f1;
  }

  .login-card {
    width: 100%;
    max-width: 28rem;
    background: #ffffff;
    border-radius: 1.5rem;
    box-shadow: 0 4px 24px rgba(16, 33, 31, 0.08);
    padding: 2.5rem 2rem;
  }

  h1 {
    font-family: "Lexend", sans-serif;
    font-weight: 600;
    font-size: 1.75rem;
    color: #0d6f69;
    margin: 0 0 0.25rem;
  }

  .subtitle {
    color: #5b6b69;
    font-size: 0.95rem;
    margin: 0 0 1.75rem;
  }

  .required-roles {
    color: #2b3d3a;
    background: #f6f5f1;
    border: 1px solid #d9ddd8;
    border-radius: 1rem;
    padding: 0.8rem 1rem;
    margin-bottom: 1rem;
    text-align: left;
  }

  .field {
    margin-bottom: 1.25rem;
  }

  .field label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: #2b3d3a;
    margin-bottom: 0.375rem;
  }

  .field input {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 1px solid #d4dbd8;
    border-radius: 1.5rem;
    font-size: 1rem;
    font-family: "Source Sans 3", sans-serif;
    background: #f6f5f1;
    color: #10211f;
    box-sizing: border-box;
  }

  .field input:focus {
    outline: none;
    border-color: #0d6f69;
    box-shadow: 0 0 0 3px rgba(13, 111, 105, 0.15);
  }

  .btn {
    width: 100%;
    padding: 0.75rem;
    border: none;
    border-radius: 1.5rem;
    font-size: 1rem;
    font-family: "Lexend", sans-serif;
    font-weight: 500;
    cursor: pointer;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #0d6f69;
    color: #ffffff;
    margin-top: 0.5rem;
  }

  .btn-primary:hover:not(:disabled) {
    background: #0b5c57;
  }

  .btn-signout {
    background: #d75b4c;
    color: #ffffff;
  }

  .btn-signout:hover:not(:disabled) {
    background: #c5303c;
  }

  .forgot-link {
    display: inline-flex;
    justify-content: center;
    width: 100%;
    background: none;
    border: none;
    text-align: center;
    color: #0d6f69;
    font-size: 0.875rem;
    text-decoration: underline;
    margin-top: 1rem;
    cursor: pointer;
  }

  .forgot-link:hover,
  .forgot-link:focus {
    color: #0b5c57;
  }

  .error-banner {
    background: #fef2f2;
    color: #b91c1c;
    border: 1px solid #fecaca;
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
    margin-bottom: 0.75rem;
  }

  .access-denied {
    text-align: left;
  }

  .password-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.5rem;
    align-items: center;
  }

  .pwd-toggle {
    border: 1px solid #d9ddd8;
    background: #ffffff;
    color: #10211f;
    border-radius: 1rem;
    padding: 0.5rem 0.75rem;
    font-family: "Source Sans 3", sans-serif;
    cursor: pointer;
  }

  .forgot-panel {
    background: #f8faf9;
    border: 1px solid #d9ddd8;
    border-radius: 1.5rem;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .forgot-panel h2 {
    margin: 0;
    font-size: 1.125rem;
    color: #10211f;
    font-family: "Lexend", sans-serif;
  }

  .forgot-panel p {
    margin: 0;
    color: #2b3d3a;
  }

  .forgot-panel a {
    color: #10211f;
    text-decoration: underline;
    width: fit-content;
  }

  .btn-secondary {
    background: #ffffff;
    border: 1px solid #d9ddd8;
    color: #10211f;
  }

  .slice-divider {
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
    text-align: center;
    color: #6a7b79;
    font-size: 0.875rem;
  }

  .slice-nav {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .slice-card {
    display: block;
    width: 100%;
    border: 1px solid #d9ddd8;
    border-radius: 1rem;
    background: #f8faf9;
    padding: 0.75rem 0.9rem;
    text-decoration: none;
    color: #10211f;
  }

  .slice-card-title {
    display: block;
    font-weight: 600;
    font-family: "Lexend", sans-serif;
    color: #0d6f69;
  }

  .slice-card-subtitle {
    display: block;
    margin-top: 0.25rem;
    font-size: 0.875rem;
    color: #4f615e;
  }
</style>

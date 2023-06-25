/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import * as _bcrypt_worker from "https://deno.land/x/bcrypt@v0.4.1/src/worker.ts";
import Footer from "../../components/Footer.tsx";
import {
  ActionLoader,
  DataLoader,
  PageMeta,
  badRequest,
  internalServerError,
  json,
  redirect,
  unauthorized,
  useLoaderData,
} from "../../Routes.ts";
import {
  AccessPermission,
  AccessToken,
  UserPermissions,
} from "../../../models.ts";

type Data = Partial<AccessToken> | null;

export const meta: PageMeta<Data> = () => {
  return {
    title: "Token",
  };
};

export const loader: DataLoader = async ({ params, context }) => {
  if (!context.user?.user_id) {
    unauthorized();
  }

  if (!(context.user.permissions & UserPermissions.CreateTokens)) {
    unauthorized();
  }

  const tokens = await context.db.query<AccessToken>(
    `select * from access_tokens where access_token_id = ? and user_id = ?`,
    [params.access_token_id, context.user.user_id]
  );

  return json(tokens?.at(0) ?? null);
};

export const loaderCreate: DataLoader = ({ context }) => {
  if (!context.user?.user_id) {
    unauthorized();
  }

  if (!(context.user.permissions & UserPermissions.CreateTokens)) {
    unauthorized();
  }

  return json<Partial<AccessToken>>({
    token_name: "",
    token_key: "",
  });
};

export const action: ActionLoader = async ({ params, request, context }) => {
  if (!context.user?.user_id) {
    unauthorized();
  }

  if (!(context.user.permissions & UserPermissions.CreateTokens)) {
    unauthorized();
  }

  type PostFormData = Partial<Pick<AccessToken, "token_name">>;
  const { token_name } = Object.fromEntries(
    await request.formData()
  ) as PostFormData;

  if (!token_name || token_name.length < 3 || token_name.length > 32) {
    badRequest();
  }

  const { affectedRows } = await context.db.execute(
    `update access_tokens set token_name = ? where access_token_id = ? and user_id = ?`,
    [token_name, params.access_token_id, context.user.user_id]
  );

  if (affectedRows !== 1) {
    unauthorized();
  }

  return redirect("/tokens/" + params.access_token_id);
};

export const actionNew: ActionLoader = async ({ request, context }) => {
  if (!context.user?.user_id) {
    unauthorized();
  }

  if (!(context.user.permissions & UserPermissions.CreateTokens)) {
    unauthorized();
  }

  type PostFormData = Partial<Pick<AccessToken, "token_name">>;
  const { token_name } = Object.fromEntries(
    await request.formData()
  ) as PostFormData;

  if (!token_name || token_name.length < 3 || token_name.length > 32) {
    return badRequest();
  }

  const { affectedRows, lastInsertId } = await context.db.execute(
    `insert into access_tokens (
          user_id
        , token_name
        , token_key
        , permissions
      ) values (
          ?
        , ?
        , ?
        , ?
      )`,
    [
      context.user.user_id,
      token_name,
      await bcrypt.hash(crypto.randomUUID()),
      AccessPermission.CreateVideos | AccessPermission.WriteVideos,
    ]
  );

  if (affectedRows !== 1) {
    return internalServerError();
  }

  return redirect("/tokens/" + lastInsertId);
};

export const actionDelete: ActionLoader = async ({ params, context }) => {
  if (!context.user?.user_id) {
    unauthorized();
  }

  if (!(context.user.permissions & UserPermissions.CreateTokens)) {
    unauthorized();
  }

  const { affectedRows } = await context.db.execute(
    `delete from access_tokens where access_token_id = ? and user_id = ?`,
    [params.access_token_id, context.user.user_id]
  );

  if (affectedRows !== 1) {
    unauthorized();
  }

  return redirect("/tokens");
};

export const Token = () => {
  const token = useLoaderData<Data>();

  if (!token) {
    return <div>Unauthorized access or token not found :(</div>;
  }

  return (
    <>
      <form action={`/tokens/${token.access_token_id ?? "new"}`} method="post">
        <label htmlFor="token_name">Name</label>
        <input
          id="token_name"
          name="token_name"
          type="text"
          value={token.token_name}
          minLength={3}
          maxLength={32}
          required
        ></input>
        <br />
        <label htmlFor="token_key">Token</label>
        <input
          id="token_key"
          name="token_key"
          type="text"
          value={token.token_key}
          readOnly
        ></input>
        <br />
        <button>{token.access_token_id ? "Update" : "Create"}</button>
      </form>
      {token.access_token_id && (
        <form action={`/tokens/${token.access_token_id}/delete`} method="post">
          <button>Delete</button>
        </form>
      )}
      <a href="/tokens">
        <button>{token.access_token_id ? "Back" : "Cancel"}</button>
      </a>
      <Footer />
    </>
  );
};

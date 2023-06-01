/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import { useNavigate, useParams } from "https://esm.sh/react-router-dom@6.11.2";

const Login = () => {
  const { access_token, token_type } = useParams();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!access_token) {
      return navigate("/");
    }

    fetch("https://discord.com/api/users/@me", {
      headers: {
        authorization: `${token_type} ${access_token}`,
      },
    })
      .then((result) => result.json())
      .then((response) => console.log(response))
      .catch(console.error);
  }, []);

  return <></>;
};

export default Login;

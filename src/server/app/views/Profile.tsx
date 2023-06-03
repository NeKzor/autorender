/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import { useLoaderData } from "https://esm.sh/react-router-dom@6.11.2";
import Footer from "../components/Footer.tsx";

const Profile = () => {
  const data = useLoaderData();

  return (
    <>
      <div>{data?.username ?? 'unknown'}</div>
      <Footer />
    </>
  );
};

export default Profile;

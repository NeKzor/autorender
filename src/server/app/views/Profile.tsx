/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import Footer from "../components/Footer.tsx";
import { useLocation } from "https://esm.sh/react-router-dom@6.11.2";

const Profile = () => {
  const location = useLocation();

  return (
    <>
      <div>{location.pathname}</div>
      <Footer />
    </>
  );
};

export default Profile;

/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'https://esm.sh/react@18.2.0';
import Footer from '../components/Footer.tsx';

export const About = () => {
  return (
    <>
      <div>Convert Portal 2 demos into videos!</div>
      <div>
        Source Code is on{' '}
        <a href='https://github.com/NeKzor/autorender' target='_blank'>
          GitHub
        </a>
      </div>
      <Footer />
    </>
  );
};

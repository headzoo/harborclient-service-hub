<script setup lang="ts">
import { withBase } from 'vitepress';

const logoSrc = withBase('/images/logo.png');
const SITE_TITLE = 'HarborClient Server';
const homeHref = withBase('/');
</script>

<template>
  <a class="docs-sidebar-brand" :href="homeHref" :aria-label="SITE_TITLE">
    <img :src="logoSrc" :alt="SITE_TITLE" width="671" height="491" decoding="async" />
  </a>
</template>

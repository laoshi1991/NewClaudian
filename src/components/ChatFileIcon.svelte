<script lang="ts">
  import { getFileIconConfig } from "../utils/fileIconMap";

  export let filename: string;
  export let isDir: boolean = false;
  export let isEmptyDir: boolean = true;
  export let className: string = "h-6 w-6 shrink-0"; // 24x24 px

  $: config = getFileIconConfig(filename, isDir, isEmptyDir);
  $: IconComponent = config.icon;
  $: color = config.color;
</script>

<svelte:component this={IconComponent} class={className} style="color: {color};" />

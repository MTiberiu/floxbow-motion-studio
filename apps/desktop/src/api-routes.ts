/** Canonical URL builders for the local studio HTTP API. */
const id = (value: string) => encodeURIComponent(value);

export const apiRoutes = {
  media: {
    project: (projectId: string) => `/api/media/${id(projectId)}`,
    assetStream: (projectId: string, assetId: string) =>
      `/api/media/${id(projectId)}/assets/${id(assetId)}/stream`,
  },
  storyboard: {
    project: (projectId: string) => `/api/storyboard/${id(projectId)}`,
    reference: (projectId: string, referenceId: string, assetId: string) =>
      `/api/storyboard/${id(projectId)}/media/${id(referenceId)}?assetId=${id(assetId)}`,
  },
};

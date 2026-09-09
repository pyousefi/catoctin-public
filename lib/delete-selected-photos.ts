export async function deleteSelectedPhotos(
  ids: string[],
  onDeleted: (id: string) => void,
  onProgress: (completed: number) => void,
) {
  const failures: { id: string; error: string }[] = [];
  let completed = 0;
  for (const id of new Set(ids)) {
    try {
      const response = await fetch(`/api/admin/photos/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        let message = "Deletion failed. Please retry.";
        if (
          response.headers.get("content-type")?.includes("application/json")
        ) {
          const body = await response.json();
          if (typeof body.error === "string") message = body.error;
        }
        throw new Error(message);
      }
      onDeleted(id);
    } catch (error) {
      failures.push({
        id,
        error:
          error instanceof Error
            ? error.message
            : "Deletion failed. Please retry.",
      });
    }
    onProgress(++completed);
  }
  return failures;
}

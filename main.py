from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
import oci
import io

app = FastAPI(
    title="OCI Object Storage API"
)

config = oci.config.from_file()

client = oci.object_storage.ObjectStorageClient(config)

namespace = client.get_namespace().data

BUCKET_NAME = "comunity_bucket_51"


@app.get("/files")
def list_files():

    response = client.list_objects(
        namespace_name=namespace,
        bucket_name=BUCKET_NAME
    )

    files = []

    for obj in response.data.objects:
        files.append({
            "name": obj.name,
            "size": obj.size,
            "etag": obj.etag,
            "modified": str(obj.time_modified)
        })

    return files



@app.post("/upload")
async def upload_file(file: UploadFile):

    content = await file.read()

    client.put_object(
        namespace_name=namespace,
        bucket_name=BUCKET_NAME,
        object_name=file.filename,
        put_object_body=content
    )

    return {
        "message": "Archivo subido",
        "file": file.filename
    }



@app.get("/download/{filename}")
def download_file(filename: str):

    try:

        obj = client.get_object(
            namespace_name=namespace,
            bucket_name=BUCKET_NAME,
            object_name=filename
        )

        return StreamingResponse(
            io.BytesIO(obj.data.content),
            media_type="application/octet-stream",
            headers={
                "Content-Disposition":
                f"attachment; filename={filename}"
            }
        )

    except Exception as e:
        raise HTTPException(
            status_code=404,
            detail=str(e)
        )


@app.delete("/files/{filename}")
def delete_file(filename: str):

    client.delete_object(
        namespace_name=namespace,
        bucket_name=BUCKET_NAME,
        object_name=filename
    )

    return {
        "message": "Archivo eliminado",
        "file": filename
    }

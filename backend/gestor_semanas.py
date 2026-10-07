from datetime import datetime

from backend.oci_storage import listar_objetos, leer_json, PREFIJO_CURADURIA


def obtener_lista_semanas_oci():
    """
    Lista las semanas disponibles extrayendo los slugs únicos 
    de las carpetas bajo el prefijo 'activos/' usando oci_storage.
    """
    try:
        # Obtenemos todos los objetos de la ruta 'activos/'
        objetos = listar_objetos(PREFIJO_CURADURIA)
        slugs_set = set()
        
        for obj in objetos:
            # Se buscan archivos que cumplan con el patrón 'activos/2026-semana-03/archivo.json'
            partes = obj.name.split("/")
            if len(partes) > 1 and partes[1]:
                slugs_set.add(partes[1])

        # Cálculo de la semana actual basado en el día de hoy
        hoy = datetime.now()
        año_iso, semana_iso, _ = hoy.isocalendar()
        slug_actual = f"{año_iso}-semana-{str(semana_iso).zfill(2)}"

        # Construimos la lista de semanas ordenadas
        semanas = []
        for slug in sorted(list(slugs_set), reverse=True):
            semanas.append({
                "slug": slug,
                "actual": (slug == slug_actual)
            })
            
        return semanas
    except Exception as e:
        print(f"Error listando semanas desde OCI: {e}")
        return []

def obtener_detalle_semana_oci(slug: str):
    """
    Lee el archivo de resumen o paquete de la semana específica 
    desde OCI usando leer_json().
    """
    try:
        # Ruta estándar donde se guarda la información de la semana
        nombre_objeto = f"{PREFIJO_CURADURIA}{slug}/resumen.json" 
        # (O si guardas curaduria.json, puedes adaptarlo al archivo que uses para el histórico)
        
        return leer_json(nombre_objeto)
    except Exception as e:
        print(f"Error al obtener el detalle de la semana {slug}: {e}")
        return None

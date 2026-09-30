"""Official OAS 3.1 document schema + OpenAPI semantic validation, no product code."""
import hashlib
import json
from pathlib import Path
import urllib.request
import yaml
import jsonschema
from openapi_spec_validator import validate

document = yaml.safe_load(Path('openapi.yaml').read_text(encoding='utf-8'))
schema_url = 'https://spec.openapis.org/oas/3.1/schema/2022-10-07'
with urllib.request.urlopen(schema_url, timeout=30) as response:
    schema_bytes = response.read()
official_schema = json.loads(schema_bytes)
jsonschema.Draft202012Validator(official_schema).validate(document)
validate(document)
print('OPENAPI_3_1_OFFICIAL_SCHEMA PASS')
print('OPENAPI_SEMANTIC_VALIDATION PASS')
print('SCHEMA_SOURCE=' + schema_url)
print('SCHEMA_SHA256=' + hashlib.sha256(schema_bytes).hexdigest())

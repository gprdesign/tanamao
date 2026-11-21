#!/usr/bin/env python3
"""Isolated disposable PostgreSQL only; never reads environment DB connection details."""
import os, pathlib, subprocess, tempfile
BIN = pathlib.Path('/usr/lib/postgresql/17/bin')
HERE = pathlib.Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='tnm-synthetic-pg-') as tmp:
    d = pathlib.Path(tmp)
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    def run(*args):
        return subprocess.run([str(x) for x in args], env=env, check=True, text=True)
    run(BIN/'initdb', '-D', d/'data', '-A', 'trust', '--no-instructions')
    # No TCP listener. Unique directory socket is private to this scratch cluster.
    try:
        run(BIN/'pg_ctl', '-D', d/'data', '-l', d/'log', '-o', f"-c listen_addresses='' -c unix_socket_directories={d} -c port=55437", '-w', 'start')
        run(BIN/'psql', '-X', '-h', d, '-p', '55437', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', HERE/'old-client-fence.synthetic.sql')
    finally:
        subprocess.run([str(BIN/'pg_ctl'), '-D', str(d/'data'), '-m', 'immediate', '-w', 'stop'], env=env, check=False)

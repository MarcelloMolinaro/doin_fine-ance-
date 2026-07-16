"""Make the backend modules importable the same way the app runs them.

The backend runs with its own directory as the working directory, so modules
import each other as top-level packages (``import constants``, ``from
services.dagster_client import ...``). Add that directory to sys.path.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

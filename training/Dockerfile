FROM python:3.10

# Install build dependencies for C extensions (Raylib, Box2D, etc. for PufferLib)
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# The code will be mounted at /app
CMD ["python", "train.py"]

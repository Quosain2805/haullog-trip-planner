from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import planner, services
from .serializers import TripRequestSerializer


@api_view(["GET"])
def health(request):
    return Response({"status": "ok"})


@api_view(["GET"])
def suggest(request):
    try:
        return Response({"results": services.suggest(request.query_params.get("q", ""))})
    except services.ServiceError as exc:
        return Response({"results": [], "error": str(exc)})


@api_view(["POST"])
def plan(request):
    ser = TripRequestSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    d = ser.validated_data
    try:
        result = planner.build_plan(d["current"], d["pickup"], d["dropoff"], d["cycle_used"], d["start_time"])
    except services.ServiceError as exc:
        return Response({"detail": str(exc)}, status=exc.status)
    return Response(result)

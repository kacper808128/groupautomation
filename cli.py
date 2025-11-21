#!/usr/bin/env python3
"""
Facebook Group Automation CLI
Anti-Ban Stack 2025
"""
import asyncio
import json
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn

from src.main import FacebookGroupAutomation, setup_logging
from src.automation.facebook import PostContent
from src.account.manager import AccountManager, AccountStatus

app = typer.Typer(
    name="fb-automation",
    help="Facebook Group Automation - Anti-Ban Stack 2025"
)
console = Console()


@app.command()
def add_account(
    account_id: str = typer.Argument(..., help="Unique account identifier"),
    email: str = typer.Argument(..., help="Account email"),
    name: Optional[str] = typer.Option(None, "--name", "-n", help="Display name"),
    proxy: Optional[str] = typer.Option(None, "--proxy", "-p", help="Proxy (ip:port:user:pass)"),
    cookies: Optional[str] = typer.Option(None, "--cookies", "-c", help="Path to cookies JSON file"),
    no_warming: bool = typer.Option(False, "--no-warming", help="Skip warming period")
):
    """Add a new account to the system."""

    async def _add():
        setup_logging()
        async with FacebookGroupAutomation() as automation:
            account = await automation.add_account(
                account_id=account_id,
                email=email,
                name=name,
                proxy=proxy,
                storage_state=cookies,
                start_warming=not no_warming
            )
            console.print(f"[green]Account added: {account.id}[/green]")
            console.print(f"  Status: {account.status.value}")
            console.print(f"  Proxy: {account.proxy or 'None'}")
            console.print(f"  Session: {account.storage_state_path}")

    asyncio.run(_add())


@app.command()
def list_accounts(
    status: Optional[str] = typer.Option(None, "--status", "-s", help="Filter by status")
):
    """List all accounts."""

    async def _list():
        async with AccountManager() as manager:
            if status:
                accounts = await manager.get_all_accounts(AccountStatus(status))
            else:
                accounts = await manager.get_all_accounts()

            table = Table(title="Accounts")
            table.add_column("ID", style="cyan")
            table.add_column("Email")
            table.add_column("Status", style="bold")
            table.add_column("Posts Today")
            table.add_column("Total Posts")
            table.add_column("Proxy")

            for account in accounts:
                posts_today = account.today_activity.posts if account.today_activity else 0
                status_style = {
                    "active": "green",
                    "warming": "yellow",
                    "banned": "red",
                    "paused": "dim"
                }.get(account.status.value, "")

                table.add_row(
                    account.id,
                    account.email,
                    f"[{status_style}]{account.status.value}[/{status_style}]",
                    str(posts_today),
                    str(account.total_posts),
                    account.proxy[:30] + "..." if account.proxy and len(account.proxy) > 30 else (account.proxy or "-")
                )

            console.print(table)

    asyncio.run(_list())


@app.command()
def post(
    groups_file: str = typer.Argument(..., help="Path to file with group URLs (one per line)"),
    text: str = typer.Option(..., "--text", "-t", help="Post text content"),
    images: Optional[str] = typer.Option(None, "--images", "-i", help="Comma-separated image paths"),
    account: Optional[str] = typer.Option(None, "--account", "-a", help="Specific account to use")
):
    """Post to multiple Facebook groups."""

    async def _post():
        setup_logging()

        # Load groups
        groups_path = Path(groups_file)
        if not groups_path.exists():
            console.print(f"[red]Groups file not found: {groups_file}[/red]")
            raise typer.Exit(1)

        with open(groups_path, "r") as f:
            groups = [line.strip() for line in f if line.strip() and not line.startswith("#")]

        if not groups:
            console.print("[red]No groups found in file[/red]")
            raise typer.Exit(1)

        console.print(f"[cyan]Loaded {len(groups)} groups[/cyan]")

        # Parse images
        image_list = None
        if images:
            image_list = [p.strip() for p in images.split(",")]

        # Create content
        content = PostContent(text=text, images=image_list)

        async with FacebookGroupAutomation() as automation:
            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                console=console
            ) as progress:
                task = progress.add_task("Posting to groups...", total=len(groups))

                results = await automation.post_to_groups(groups, content)

                progress.update(task, completed=len(results))

            # Summary
            successful = sum(1 for r in results if r.status.value == "completed")
            failed = sum(1 for r in results if r.status.value == "failed")

            console.print(f"\n[green]Completed: {successful}[/green]")
            console.print(f"[red]Failed: {failed}[/red]")

    asyncio.run(_post())


@app.command()
def warm(
    account_id: str = typer.Argument(..., help="Account ID to warm up")
):
    """Perform warming actions for an account."""

    async def _warm():
        setup_logging()
        async with FacebookGroupAutomation() as automation:
            console.print(f"[cyan]Starting warming for account: {account_id}[/cyan]")
            await automation.do_warming_actions(account_id)
            console.print(f"[green]Warming complete[/green]")

    asyncio.run(_warm())


@app.command()
def refresh(
    account_id: str = typer.Argument(..., help="Account ID to refresh")
):
    """Refresh an account's session."""

    async def _refresh():
        setup_logging()
        async with FacebookGroupAutomation() as automation:
            console.print(f"[cyan]Refreshing session for: {account_id}[/cyan]")
            await automation.refresh_session(account_id)
            console.print(f"[green]Session refreshed[/green]")

    asyncio.run(_refresh())


@app.command()
def test_proxy(
    proxy: str = typer.Argument(..., help="Proxy to test (ip:port:user:pass)")
):
    """Test a proxy connection."""

    async def _test():
        from src.browser.manager import ProxyManager

        proxy_manager = ProxyManager()
        console.print(f"[cyan]Testing proxy: {proxy}[/cyan]")

        is_valid, result = await proxy_manager.test_proxy_with_retry(proxy)

        if is_valid:
            console.print(f"[green]Proxy working! IP: {result}[/green]")
        else:
            console.print(f"[red]Proxy failed: {result}[/red]")

    asyncio.run(_test())


@app.command()
def stats():
    """Show account statistics."""

    async def _stats():
        async with AccountManager() as manager:
            accounts = await manager.get_all_accounts()

            # Summary
            total = len(accounts)
            active = sum(1 for a in accounts if a.status == AccountStatus.ACTIVE)
            warming = sum(1 for a in accounts if a.status == AccountStatus.WARMING)
            banned = sum(1 for a in accounts if a.status == AccountStatus.BANNED)

            console.print("\n[bold]Account Statistics[/bold]")
            console.print(f"  Total accounts: {total}")
            console.print(f"  [green]Active: {active}[/green]")
            console.print(f"  [yellow]Warming: {warming}[/yellow]")
            console.print(f"  [red]Banned: {banned}[/red]")

            # Today's activity
            total_posts_today = sum(
                a.today_activity.posts if a.today_activity else 0
                for a in accounts
            )
            total_actions_today = sum(
                a.today_activity.total_actions if a.today_activity else 0
                for a in accounts
            )

            console.print(f"\n[bold]Today's Activity[/bold]")
            console.print(f"  Posts: {total_posts_today}")
            console.print(f"  Total actions: {total_actions_today}")

            # Recent bans
            recent_bans = await manager.get_recent_bans(hours=24)
            if recent_bans:
                console.print(f"\n[bold red]Bans in last 24h: {len(recent_bans)}[/bold red]")

    asyncio.run(_stats())


@app.command()
def import_cookies(
    account_id: str = typer.Argument(..., help="Account ID"),
    cookies_file: str = typer.Argument(..., help="Path to cookies file (JSON or HAR)")
):
    """Import cookies from a file."""

    cookies_path = Path(cookies_file)
    if not cookies_path.exists():
        console.print(f"[red]File not found: {cookies_file}[/red]")
        raise typer.Exit(1)

    # Read cookies
    with open(cookies_path, "r") as f:
        data = json.load(f)

    # Convert to Playwright format if needed
    if isinstance(data, list):
        # Raw cookies array
        storage_state = {"cookies": data, "origins": []}
    elif "log" in data:
        # HAR format
        cookies = []
        for entry in data.get("log", {}).get("entries", []):
            for cookie in entry.get("response", {}).get("cookies", []):
                cookies.append({
                    "name": cookie["name"],
                    "value": cookie["value"],
                    "domain": cookie.get("domain", ".facebook.com"),
                    "path": cookie.get("path", "/"),
                })
        storage_state = {"cookies": cookies, "origins": []}
    else:
        # Assume already in Playwright format
        storage_state = data

    # Save to session file
    from src.account.manager import SessionManager
    session_manager = SessionManager()

    async def _save():
        await session_manager.save_session(account_id, storage_state)

    asyncio.run(_save())

    console.print(f"[green]Cookies imported for account: {account_id}[/green]")
    console.print(f"Saved to: {session_manager.get_storage_state_path(account_id)}")


@app.command()
def init():
    """Initialize the project (create directories, database)."""

    # Create directories
    dirs = [
        "data/sessions",
        "logs/screenshots",
        "config"
    ]

    for d in dirs:
        Path(d).mkdir(parents=True, exist_ok=True)
        console.print(f"[green]Created: {d}[/green]")

    # Initialize database
    async def _init_db():
        async with AccountManager() as manager:
            pass  # Tables created on connect

    asyncio.run(_init_db())

    console.print(f"[green]Database initialized: data/accounts.db[/green]")
    console.print("\n[bold]Project initialized![/bold]")
    console.print("Next steps:")
    console.print("  1. Add accounts: fb-automation add-account <id> <email> --proxy <proxy>")
    console.print("  2. Import cookies: fb-automation import-cookies <id> <cookies.json>")
    console.print("  3. Start posting: fb-automation post groups.txt --text 'Hello!'")


if __name__ == "__main__":
    app()
